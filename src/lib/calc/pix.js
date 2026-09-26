/* PIX: a chave no formato que o app do banco aceita, e o "Pix copia e cola".
 *
 * Pedido do Léo (25/09/2026): "fazer algo para ficar fácil de copiar e colar o
 * pix". Duas coisas saem daqui:
 *
 * 1. A CHAVE NO FORMATO DO PIX. O que está cadastrado é o que alguém digitou:
 *    CNPJ com pontos, celular com parênteses. Colado no app, isso ora passa,
 *    ora trava ("chave inválida"). O formato que o sistema do Pix usa é um só:
 *    CPF e CNPJ só com os dígitos, celular como +55 DDD número, e-mail e chave
 *    aleatória em minúsculas. É esse que o botão copia.
 *
 * 2. O CÓDIGO "PIX COPIA E COLA" (o BR Code estático do Banco Central). Quem
 *    paga cola no app, na opção "Pix copia e cola", e o app já preenche a chave,
 *    o recebedor e, se houver, o valor. Nada para digitar, nada para errar.
 *    O formato é o do Manual de Padrões para Iniciação do Pix (BCB): campos
 *    ID + tamanho + valor, fechados por um CRC16 que o app confere. Campo com
 *    tamanho errado ou CRC errado e o app recusa o código inteiro.
 *
 * O TIPO QUE A CHAVE TEM é lido pelo FORMATO dela, e comparado com o tipo
 * cadastrado. Tipo errado é o erro que mais trava pagamento: a chave aleatória
 * cadastrada como "CNPJ" manda o cliente escolher CNPJ no app e colar um código
 * que não é CNPJ.
 */

const soDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* A regra de e-mail do diretório do Pix (DICT): ASCII, minúsculas, até 77
   caracteres, e aqui ainda com ponto no domínio. E-mail com acento não é chave
   Pix; aceitar deixava o campo do código passar de 99 bytes (revisão 25/09). */
const EMAIL = /^[a-z0-9.!#$&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/* CARACTERES INVISÍVEIS: chave colada do WhatsApp ou do e-mail chega com
   espaço de largura zero, e o app do banco não acha a chave. Montado pelos
   códigos para o arquivo não carregar caractere invisível. */
const INVISIVEIS = new RegExp(
  "[" + [[0x00ad, 0x00ad], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff]]
    .map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "]",
  "g"
);
export const limparChave = (x) => String(x ?? "").replace(INVISIVEIS, "").trim();
// CNPJ sem a pontuação; com letras em maiúsculas (o CNPJ alfanumérico da Receita).
const semPontuacao = (s) => String(s ?? "").replace(/[\s./-]/g, "").toUpperCase();
const CNPJ_FORMA = /^[0-9A-Z]{12}\d{2}$/;
// Celular do Pix: 55 + DDD (sem zero) + 9 + oito dígitos. Fixo não é chave Pix.
const CELULAR = /^55[1-9]{2}9\d{8}$/;

/* O TIPO PELO FORMATO, sem jogar nada fora.
   Revisão de 25/09/2026: tirar as letras antes de olhar sobrava dígitos com
   cara de celular, e o botão copiava o número de OUTRA pessoa. Agora:
   - letra só existe em e-mail, chave aleatória e CNPJ alfanumérico (novo da
     Receita, 2026); qualquer outra letra = formato que não dá para afirmar;
   - onze dígitos: a forma escrita decide (máscara de CPF é CPF, parênteses ou
     "-0000" no fim é celular); só com dígitos soltos o cadastro desempata, e
     CPF com dígito verificador errado nunca vira celular. */
export function tipoDaChave(chave, tipoCadastrado = "") {
  const s = limparChave(chave);
  if (!s) return "";
  if (EVP.test(s)) return "Aleatoria";
  if (s.includes("@")) {
    const e = s.toLowerCase();
    return e.length <= 77 && EMAIL.test(e) ? "E-mail" : "";
  }
  if (/[A-Za-z]/.test(s)) {
    const c = semPontuacao(s);
    return CNPJ_FORMA.test(c) && cnpjValido(c) ? "CNPJ" : "";
  }
  if (!/^\+?[\d\s.()/-]+$/.test(s)) return "";
  const d = soDigitos(s);
  if (s.startsWith("+")) return CELULAR.test(d) ? "Telefone" : "";
  if (d.length === 14) return !/[()]/.test(s) && cnpjValido(d) ? "CNPJ" : "";
  if (d.length === 11) {
    const fone = CELULAR.test("55" + d);
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(s)) return cpfValido(d) ? "CPF" : "";
    if (/[()]/.test(s) || /\d-\d{4}$/.test(s)) return fone ? "Telefone" : "";
    if (tipoCadastrado === "CPF") return cpfValido(d) ? "CPF" : "";
    if (tipoCadastrado === "Telefone") return fone ? "Telefone" : "";
    if (cpfValido(d)) return "CPF";
    return fone ? "Telefone" : "";
  }
  if (d.length === 13) return CELULAR.test(d) ? "Telefone" : "";
  return "";
}

export function cpfValido(d) {
  d = soDigitos(d);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/* CNPJ numérico ou alfanumérico (IN RFB 2.229/2024, emitido desde julho de
   2026): 12 posições [0-9A-Z] e 2 dígitos verificadores. O valor de cada
   posição é o código do caractere menos 48 (0 a 9 continuam 0 a 9, A = 17),
   com os mesmos pesos do CNPJ de sempre. */
export function cnpjValido(x) {
  const c = semPontuacao(x);
  if (!CNPJ_FORMA.test(c) || /^(.)\1+$/.test(c)) return false;
  const valor = (ch) => ch.charCodeAt(0) - 48;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + valor(c[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

/* A CHAVE COMO O PIX A CONHECE. Devolve "" quando não dá para afirmar o
   formato: copiar algo que parece chave e não é seria pior que não copiar. */
export function chaveCanonica(chave, tipoCadastrado = "") {
  const s = limparChave(chave);
  const tipo = tipoDaChave(s, tipoCadastrado);
  if (tipo === "CPF") return soDigitos(s);
  if (tipo === "CNPJ") return semPontuacao(s);
  if (tipo === "E-mail" || tipo === "Aleatoria") return s.toLowerCase();
  if (tipo === "Telefone") {
    const d = soDigitos(s);
    return "+" + (d.length === 11 ? "55" + d : d); // 11 = DDD + número; 13 = já com o 55
  }
  return "";
}

// Como a chave aparece para a gente ler (e para quem vai digitar à mão).
export function chaveLegivel(chave, tipoCadastrado = "") {
  const c = chaveCanonica(chave, tipoCadastrado);
  const tipo = tipoDaChave(chave, tipoCadastrado);
  if (!c) return limparChave(chave);
  if (tipo === "CNPJ") return c.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  if (tipo === "CPF") return c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (tipo === "Telefone") {
    const m = c.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : c;
  }
  return c;
}

/* O QUE A TELA PRECISA SABER DA CHAVE: o formato de copiar, o tipo que ela
   tem, e o aviso quando o cadastro diz outro tipo. */
export function conferirChave(chave, tipoCadastrado = "") {
  const s = limparChave(chave);
  if (!s) return { chave: "", tipo: "", legivel: "", aviso: "" };
  const tipo = tipoDaChave(s, tipoCadastrado);
  const canon = chaveCanonica(s, tipoCadastrado);
  let aviso = "";
  if (!tipo) aviso = "Esta chave não tem o formato de nenhum tipo de chave Pix (CPF, CNPJ, e-mail, celular ou aleatória). Confira no app do banco antes de passar.";
  else if (tipoCadastrado && tipoCadastrado !== "Conta e agencia" && tipoCadastrado !== tipo) {
    aviso = `A chave tem formato de ${nomeDoTipo(tipo)}, mas está cadastrada como ${nomeDoTipo(tipoCadastrado)}. Quem paga escolhe o tipo errado no app e o Pix não encontra a chave: corrija o tipo no cadastro.`;
  }
  return { chave: canon, tipo, legivel: chaveLegivel(s, tipoCadastrado), aviso };
}

export function nomeDoTipo(t) {
  return { Aleatoria: "chave aleatória", "E-mail": "e-mail", Telefone: "celular", CPF: "CPF", CNPJ: "CNPJ" }[t] || t;
}

/* ------------------------------------------------------------ BR Code */

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), o que o manual do BCB pede.
export function crc16(texto) {
  const bytes = new TextEncoder().encode(texto);
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ID + tamanho em dois dígitos + valor. O tamanho conta BYTES, não letras.
function campo(id, valor) {
  const v = String(valor);
  const n = new TextEncoder().encode(v).length;
  if (n > 99) throw new Error(`O campo ${id} do código Pix passou de 99 caracteres.`);
  return id + String(n).padStart(2, "0") + v;
}

/* Nome e cidade: sem acento, só letras, números e espaço, no tamanho do manual
   (25 e 15). Acento vira letra simples porque app antigo recusa byte fora do
   ASCII, e o tamanho do campo conta bytes. */
export function textoDoCodigo(s, max) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
}

/* O identificador (txid) do código estático: letras e números, até 25. Sem
   ele, "***" (o manual manda este valor quando não há identificador). */
export function txidDoCodigo(s) {
  const t = String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return t || "***";
}

/* O VALOR, se houver: número positivo, duas casas, ponto como separador (é o
   formato do campo 54, não o da tela). Vazio ou zero = o pagador digita. */
export function valorDoCodigo(v) {
  if (v === "" || v == null) return "";
  /* SÓ AS FORMAS QUE NÃO DEIXAM DÚVIDA. "10,50" e "1.234,50" são o jeito
     daqui; "10.50" também aparece (ponto seguido de 1 ou 2 dígitos no fim é
     decimal). O resto é recusado, não adivinhado: a revisão de 25/09 achou
     "1,250.00" (planilha em inglês) virando R$ 1,25 e "1.250.00" virando
     R$ 125.000,00. Mais de 2 casas também é recusado ("0,001" virava zero). */
  let n;
  if (typeof v === "number") n = v;
  else {
    const t = String(v).trim().replace(/^R\$\s*/i, "");
    let s = null;
    // Vírgula no fim ("1,") é o valor sendo digitado: vale o que já tem.
    if (/^\d{1,3}(\.\d{3})+(,\d{0,2})?$/.test(t)) s = t.replace(/\./g, "").replace(/,$/, "").replace(",", "."); // 1.250 · 1.250,00
    else if (/^\d+(,\d{0,2})?$/.test(t)) s = t.replace(/,$/, "").replace(",", "."); // 1250 · 1250,5
    else if (/^\d+\.\d{1,2}$/.test(t)) s = t; // 10.50
    n = s == null ? NaN : Number(s);
  }
  if (!Number.isFinite(n) || n <= 0) return null; // inválido: a tela avisa
  const r = Math.round(n * 100) / 100;
  if (r <= 0) return null;
  const s = r.toFixed(2);
  return s.length > 13 ? null : s;
}

/* O "PIX COPIA E COLA" estático.
   { chave, tipo, nome, cidade, valor, txid, mensagem } -> { codigo } ou { erro } */
export function pixCopiaECola(dados = {}) {
  /* Nunca lança: um erro aqui dentro derrubava a tela inteira do Painel
     (revisão de 25/09). Erro vira mensagem. */
  try {
    return montarCodigo(dados);
  } catch (e) {
    return { erro: `Não foi possível gerar o código: ${e.message}` };
  }
}

/* QUANTO DA MENSAGEM CABE NO CÓDIGO. Ela vai dentro do campo 26, que tem
   teto de 99, junto com a chave: com chave aleatória (36) sobram 37 letras;
   com CNPJ, 57. O manual ainda limita a 72. A tela usa este número para o
   contador, e o gerador usa o mesmo: uma conta só. */
export function limiteDaMensagem(chave, tipo = "") {
  const k = chaveCanonica(chave, tipo);
  if (!k) return 0;
  const base = campo("00", "br.gov.bcb.pix") + campo("01", k);
  return Math.max(0, Math.min(72, 99 - base.length - 4));
}

// Corta no último espaço que couber, para não picar palavra ("PAI" de "painel").
function cortarNaPalavra(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max + 1).lastIndexOf(" ");
  return (corte > 0 ? texto.slice(0, corte) : texto.slice(0, max)).trim();
}

function montarCodigo({ chave, tipo = "", nome, cidade, valor = "", txid = "", mensagem = "" }) {
  const k = chaveCanonica(chave, tipo);
  if (!k) return { erro: "A chave Pix desta conta não tem um formato válido. Confira o cadastro." };
  const n = textoDoCodigo(nome, 25);
  if (!n) return { erro: "Falta o nome do titular da conta." };
  const c = textoDoCodigo(cidade, 15);
  if (!c) return { erro: "Falta a cidade do titular (o código Pix exige)." };
  const v = valorDoCodigo(valor);
  if (v === null) return { erro: "Valor inválido: use um número maior que zero, como 1.250,00." };
  const base = campo("00", "br.gov.bcb.pix") + campo("01", k);
  const inteira = textoDoCodigo(mensagem, 999);
  const msg = cortarNaPalavra(inteira, limiteDaMensagem(chave, tipo));
  const conta = base + (msg ? campo("02", msg) : "");
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (v ? campo("54", v) : "") +
    campo("58", "BR") +
    campo("59", n) +
    campo("60", c) +
    campo("62", campo("05", txidDoCodigo(txid))) +
    "6304";
  // O que foi de fato no código, para a tela avisar quando a mensagem foi cortada.
  return { codigo: semCrc + crc16(semCrc), mensagemNoCodigo: msg, mensagemCortada: !!inteira && inteira !== msg };
}

/* LER DE VOLTA o código (para os testes e para conferir o que sai da tela):
   devolve os campos pelo ID, e se o CRC fecha. */
export function lerCodigo(codigo) {
  const s = String(codigo ?? "");
  const campos = {};
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2);
    const n = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(n)) return { valido: false, campos };
    campos[id] = s.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  const crcOk = !!campos["63"] && crc16(s.slice(0, -4)) === campos["63"];
  return { valido: crcOk && i === s.length, campos };
}
