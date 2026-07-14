// Helper compartilhado das Functions. Guarda a chave do Mubi no servidor e fala
// com o ERP (somente GET). Este arquivo NAO vira uma Function (esta em lib/).
//
// Variaveis de ambiente do Netlify (Project settings > Environment variables):
//   MUBI_BASE_URL    ex.: https://api.mubi.com.br/v1
//   MUBI_PUBLIC_KEY  a publicKey que vai no caminho
//   MUBI_TOKEN       token de autenticacao (confirmar o metodo exato com a doc)

const BASE = process.env.MUBI_BASE_URL || "";
const PUB = process.env.MUBI_PUBLIC_KEY || "";
const TOKEN = process.env.MUBI_TOKEN || "";

export function mubiConfigurado() {
  return Boolean(BASE && PUB);
}

// GET em {BASE}/{publicKey}/{caminho}. Ajustar o header de auth quando o metodo
// real for confirmado (a doc indica cadeado; pode ser Bearer ou header proprio).
export async function mubiGet(caminho) {
  if (!mubiConfigurado()) {
    const err = new Error("Mubi nao configurado (defina MUBI_BASE_URL e MUBI_PUBLIC_KEY).");
    err.code = "SEM_CONFIG";
    throw err;
  }
  const url = `${BASE.replace(/\/$/, "")}/${PUB}/${caminho.replace(/^\//, "")}`;
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!resp.ok) {
    throw new Error(`Mubi ${caminho} respondeu ${resp.status}`);
  }
  return resp.json();
}

export function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// Resposta padrao quando o Mubi ainda nao foi ligado: o front usa MODO_DEMO.
export function semConfig() {
  return json(
    { erro: "Mubi nao configurado. O painel roda em MODO_DEMO ate as variaveis de ambiente serem definidas." },
    501
  );
}

// Converte "1.234,56" ou "1234.56" ou number em Number seguro.
export function num(v) {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : Number(v) || 0;
}
