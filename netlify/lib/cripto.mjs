// Autenticacao sem dependencias: JWT HS256 + hash de senha PBKDF2, usando so a
// Web Crypto do runtime (Node 20 do Netlify). Pequeno e auditavel de proposito.
//
// Portado do app de RH (netlify/lib/cripto.mts) para o painel manter o MESMO
// mecanismo dos dois lados: uma falha encontrada la vale aqui, e vice-versa.

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64url ----
function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytesFromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlFromString = (s) => b64urlFromBytes(enc.encode(s));
const stringFromB64url = (s) => dec.decode(bytesFromB64url(s));

// ---- hex ----
const hexFromBytes = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
function bytesFromHex(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ---- JWT HS256 ----
async function chaveHmac(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function assinarJwt(payload, secret, expSeg = 60 * 60 * 12) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { ...payload, iat: agora, exp: agora + expSeg };
  const cabecalho = b64urlFromString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const dados = `${cabecalho}.${b64urlFromString(JSON.stringify(corpo))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await chaveHmac(secret), enc.encode(dados)));
  return `${dados}.${b64urlFromBytes(sig)}`;
}

export async function verificarJwt(token, secret) {
  const partes = String(token || "").split(".");
  if (partes.length !== 3) return null;
  const dados = `${partes[0]}.${partes[1]}`;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await chaveHmac(secret), bytesFromB64url(partes[2]), enc.encode(dados));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload;
  try {
    payload = JSON.parse(stringFromB64url(partes[1]));
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ---- senha (PBKDF2-SHA256) ----
export async function hashSenha(senha, saltHex, iter = 120000) {
  const salt = saltHex ? bytesFromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey("raw", enc.encode(senha), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    km,
    256
  );
  return { hash: hexFromBytes(new Uint8Array(bits)), salt: hexFromBytes(salt), iter };
}

export async function conferirSenha(senha, reg) {
  if (!reg?.hash || !reg?.salt) return false;
  const { hash } = await hashSenha(senha, reg.salt, reg.iter || 120000);
  // Comparacao em tempo constante: comparar com === vazaria, pelo tempo de
  // resposta, quantos caracteres do hash bateram.
  if (hash.length !== reg.hash.length) return false;
  let dif = 0;
  for (let i = 0; i < hash.length; i++) dif |= hash.charCodeAt(i) ^ reg.hash.charCodeAt(i);
  return dif === 0;
}

// Nome de usuario sem acento, minusculo, espacos colapsados: "José  Silva" e
// "jose silva" viram a mesma chave, senao a pessoa nao consegue entrar.
export const normalizarUsuario = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Le o cracha do header Authorization: Bearer <jwt>. Devolve o payload ou null.
export async function sessaoDoPedido(req, secret) {
  const auth = (req.headers.get && req.headers.get("authorization")) || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verificarJwt(m[1], secret);
}
