// Formatacao PT-BR e regras de data. Nenhum travessao nos textos.

export function moeda(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function moedaCheia(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function numero(v) {
  return (Number(v) || 0).toLocaleString("pt-BR");
}

export function pct(v, casas = 0) {
  const n = Number(v) || 0;
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

// Regra de fuso do blueprint: nunca slice(0,10) de timestamp UTC.
export function diaLocalISO(iso) {
  const s = String(iso);
  return s.includes("T") ? ymdLocal(new Date(s)) : s.slice(0, 10);
}

export function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function dataCurta(iso) {
  if (!iso) return "";
  const dia = diaLocalISO(iso);
  const [a, m, d] = dia.split("-");
  return `${d}/${m}`;
}

export function dataLonga(iso) {
  if (!iso) return "";
  const dia = diaLocalISO(iso);
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

export function rotuloMes(chaveMes) {
  // chaveMes no formato AAAA-MM
  const [a, m] = String(chaveMes).split("-");
  return `${MESES[Number(m) - 1] || ""}/${String(a).slice(2)}`;
}

export function diasEntre(isoA, isoB) {
  const a = new Date(diaLocalISO(isoA) + "T00:00:00");
  const b = new Date(diaLocalISO(isoB) + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
