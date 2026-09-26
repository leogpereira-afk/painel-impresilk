/* OS BANCOS DO PAÍS: número da compensação, cor da marca e o nome curto.
 *
 * Pedido do Léo (25/09/2026): "colocar logomarca e número de banco". Nenhuma
 * conta cadastrada tem o número (medido em 25/09: 0 de 18), mas o NOME quase
 * sempre diz qual é o banco ("BTG 208", "Sicoob Credinor", "BB", "BNB").
 *
 * UM CÓDIGO ERRADO É PIOR QUE NENHUM: ele vai para dentro de uma TED. Por isso
 * (a mesma regra da Central do Léo, de onde esta lista veio):
 * - a busca casa por PALAVRA INTEIRA ("interior" não vira Inter);
 * - número de 3 dígitos escrito no nome confirma o banco; qualquer outro
 *   número, ou dois bancos no nome, anula a dedução (não chutamos);
 * - o código deduzido aparece marcado "pelo nome", e o cadastrado sempre vence.
 *
 * LOGO: nenhuma imagem de banco entra no repositório (ele é público). A logo é
 * a que alguém anexar na tela; sem ela, um selo com a cor e o nome curto.
 */

// [código, nome curto (selo), nome para mensagem, cor, ...apelidos]
const BANCOS = [
  ["756", "Sicoob", "Sicoob (Bancoob)", "#003641", "sicoob", "bancoob", "credinor", "credinosso"],
  ["748", "Sicredi", "Sicredi", "#3FA110", "sicredi"],
  ["001", "BB", "Banco do Brasil", "#FCEF00", "banco do brasil", "bb"],
  ["237", "Bradesco", "Bradesco", "#CC092F", "bradesco"],
  ["341", "Itaú", "Itaú Unibanco", "#EC7000", "itau", "itau unibanco"],
  ["033", "Santander", "Santander", "#EC0000", "santander"],
  ["473", "Caixa Geral", "Banco Caixa Geral Brasil", "#00529B", "caixa geral"],
  ["104", "Caixa", "Caixa Econômica Federal", "#0070AF", "caixa", "cef", "caixa economica"],
  ["077", "Inter", "Banco Inter", "#FF7A00", "inter", "banco inter"],
  ["260", "Nubank", "Nu Pagamentos (Nubank)", "#820AD1", "nubank", "nu pagamentos"],
  ["336", "C6", "C6 Bank", "#242424", "c6", "c6 bank"],
  ["208", "BTG", "BTG Pactual", "#0D1B2A", "btg", "btg pactual"],
  ["422", "Safra", "Banco Safra", "#00285E", "safra"],
  ["041", "Banrisul", "Banrisul", "#0D6AB4", "banrisul"],
  ["070", "BRB", "BRB Banco de Brasília", "#0A5EA8", "brb"],
  ["389", "Mercantil", "Banco Mercantil do Brasil", "#006341", "mercantil"],
  ["318", "BMG", "Banco BMG", "#F58220", "bmg"],
  ["212", "Original", "Banco Original", "#00A868", "original", "banco original"],
  ["707", "Daycoval", "Banco Daycoval", "#004B8D", "daycoval"],
  ["246", "ABC", "Banco ABC Brasil", "#0B2A5B", "abc brasil"],
  ["623", "Pan", "Banco Pan", "#00A9E0", "pan", "banco pan"],
  // BV: 413 desde 21/09/2021 (o 655 ficou com o Banco Votorantim S.A.; as contas do BV migraram).
  ["413", "BV", "Banco BV", "#004B8D", "bv", "votorantim"],
  ["290", "PagBank", "PagBank (PagSeguro)", "#00AA4F", "pagbank", "pagseguro"],
  ["323", "Mercado Pago", "Mercado Pago", "#00AEEF", "mercado pago"],
  ["380", "PicPay", "PicPay", "#21C25E", "picpay"],
  ["085", "Ailos", "Ailos (Cecred)", "#00A5A8", "ailos", "cecred"],
  ["136", "Unicred", "Unicred", "#00539B", "unicred"],
  ["133", "Cresol", "Cresol", "#00843D", "cresol"],
  ["021", "Banestes", "Banestes", "#0067B1", "banestes"],
  ["003", "Basa", "Banco da Amazônia", "#005C3C", "banco da amazonia", "basa"],
  ["004", "BNB", "Banco do Nordeste", "#004B8D", "banco do nordeste", "bnb"],
  ["613", "Omni", "Omni Banco", "#F47920", "omni"],
  ["637", "Sofisa", "Banco Sofisa", "#004990", "sofisa"],
  ["643", "Pine", "Banco Pine", "#0B3C5D", "pine"],
  ["224", "Fibra", "Banco Fibra", "#0A3D62", "fibra"],
  ["197", "Stone", "Stone", "#00A868", "stone"],
  ["403", "Cora", "Cora", "#FE3E6D", "cora"],
  ["364", "Efí", "Efí (Gerencianet)", "#F37021", "efi", "gerencianet"],
].map(([codigo, sigla, nome, cor, ...apelidos]) => ({ codigo, sigla, nome, cor, apelidos }));

export const CATALOGO_BANCOS = BANCOS;
const PORCODIGO = new Map(BANCOS.map((b) => [b.codigo, b]));
export const bancoPorCodigo = (codigo) => PORCODIGO.get(String(codigo ?? "").trim()) || null;

const norm = (s) =>
  " " + String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim() + " ";

/* O BANCO PELO NOME, ou nada. Palavra inteira; o número escrito no nome
   confirma, e qualquer outro número de 3 dígitos anula.
   Revisão de 25/09/2026: o primeiro banco da lista vencia ("Nubank (antigo
   Itaú)" virava Itaú) e o número colado em outro escapava ("BTG 208 237").
   Dois bancos no nome = nada. Apelido contido em apelido maior do outro banco
   ("caixa" dentro de "caixa geral") fica com o maior: é o mesmo trecho. */
export function bancoPeloNome(nome) {
  const n = norm(nome);
  if (!n.trim()) return null;
  const numeros = [...n.matchAll(/ (\d{3})(?= )/g)].map((m) => m[1]);
  const casados = [];
  for (const b of BANCOS) {
    const a = b.apelidos.map(norm).filter((x) => n.includes(x)).sort((x, y) => y.length - x.length)[0];
    if (a) casados.push({ b, a });
  }
  const achados = casados.filter((c) => !casados.some((o) => o !== c && o.a.length > c.a.length && o.a.includes(c.a)));
  if (achados.length > 1) return null;
  const achado = achados[0]?.b || null;
  if (achado) return numeros.some((c) => c !== achado.codigo) ? null : achado;
  // Só o número: vale se for um só e for de banco conhecido.
  const unicos = [...new Set(numeros)];
  return unicos.length === 1 ? PORCODIGO.get(unicos[0]) || null : null;
}

/* NÚMERO DIGITADO QUE CONTRADIZ O NOME, ou que a lista não conhece: a tela
   pergunta antes de gravar, porque dali ele vai para a mensagem de TED. */
export function conflitoDoCodigo(nome, codigo) {
  const cad = String(codigo ?? "").trim();
  if (!/^\d{3}$/.test(cad)) return null;
  const pelo = bancoPeloNome(nome);
  const dele = bancoPorCodigo(cad);
  if (pelo && pelo.codigo !== cad) {
    return `O nome "${String(nome).trim()}" indica ${pelo.codigo} (${pelo.nome}), mas o número digitado é ${cad}${dele ? ` (${dele.nome})` : ""}.`;
  }
  if (!dele) return `O número ${cad} não está na lista de bancos que o painel conhece. Confira no extrato ou no app do banco.`;
  return null;
}

/* O CÓDIGO QUE O CARTÃO MOSTRA, e de onde veio. Cadastro manda; o deduzido
   vem marcado. Código cadastrado fora do catálogo continua valendo (banco
   pequeno que a lista não tem), só não ganha cor. */
export function codigoDaConta(conta) {
  const cad = String(conta?.codigoBanco ?? "").trim();
  if (/^\d{3}$/.test(cad)) return { codigo: cad, deduzido: false, banco: bancoPorCodigo(cad) };
  const b = bancoPeloNome(conta?.banco);
  return b ? { codigo: b.codigo, deduzido: true, banco: b } : null;
}

/* A LOGO: a da própria conta, ou a de outra conta do MESMO banco (anexar uma
   vez vale para todas). Só imagem de verdade (PNG, JPEG, WebP em base64) e de
   tamanho razoável: o dado vem do servidor e vira src de <img>. */
export const LOGO_MAX = 200_000;
export const logoValida = (s) =>
  typeof s === "string" && s.length <= LOGO_MAX && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(s);

export function logoDaConta(conta, todas = []) {
  if (logoValida(conta?.logo)) return conta.logo;
  const meu = codigoDaConta(conta)?.codigo;
  if (!meu) return "";
  const irma = (todas || []).find((c) => c !== conta && logoValida(c?.logo) && codigoDaConta(c)?.codigo === meu);
  return irma ? irma.logo : "";
}

/* O SELO SEM LOGO: nome curto e cor da marca; banco fora da lista ganha uma
   cor fixa tirada do nome (a mesma conta, a mesma cor, sempre). O texto é
   branco ou escuro, o que der mais contraste com o fundo. */
export function seloDoBanco(conta) {
  const k = codigoDaConta(conta);
  const b = k?.banco;
  const nome = String(conta?.banco ?? "").trim();
  const sigla = b ? b.sigla : (nome.split(/\s+/)[0] || "?").slice(0, 8);
  const cor = b ? b.cor : corDoNome(nome);
  return { sigla, cor, texto: textoSobre(cor) };
}

export function corDoNome(nome) {
  let h = 0;
  for (const ch of String(nome ?? "")) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${h} 45% 38%)`;
}

function luminancia(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.1; // hsl de corDoNome: escuro o bastante para texto branco
  const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function textoSobre(cor) {
  const L = luminancia(cor);
  const contraste = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return contraste(L, 1) >= contraste(L, 0.012) ? "#FFFFFF" : "#0F172A";
}
