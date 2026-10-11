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

// Le um valor digitado por gente e devolve numero. O separador decimal e
// decidido pelo ULTIMO sinal: "1.500,50" e "1500.50" valem 1500,5; "1.500" e
// "85.000" sao milhar (1500 e 85000). Sem isso, tratar todo ponto como milhar
// transformava 1500.5 em 15005 -- foi o que corrompeu o valor das licitacoes
// ao reabrir o formulario, porque o numero volta do banco em formato JS.
export function paraNumero(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  const corte = Math.max(ultimaVirgula, ultimoPonto);
  // Sinal isolado com 1 ou 2 casas depois = decimal; o resto e milhar.
  const ehDecimal = corte > -1 && s.length - corte - 1 > 0 && s.length - corte - 1 <= 2;
  const limpo = ehDecimal
    ? s.slice(0, corte).replace(/[.,]/g, "") + "." + s.slice(corte + 1)
    : s.replace(/[.,]/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

// Numero -> texto para EDITAR (pt-BR, sem separador de milhar): 1500.5 vira
// "1500,5". Nao usar moeda() aqui: o campo tem que voltar do jeito que a
// pessoa digita.
export function paraCampo(n) {
  if (!n) return "";
  return String(n).replace(".", ",");
}

export function diasEntre(isoA, isoB) {
  const a = new Date(diaLocalISO(isoA) + "T00:00:00");
  const b = new Date(diaLocalISO(isoB) + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

/* NUMERO CURTO para chip e cartao pequeno: "1,2 mil", "3,4 mi", "1 bi".
   Quem mostra poe o valor exato no `title` (numero() ou moeda()), porque o
   curto arredonda. O espaco entre o numero e "mil" e o inseparavel (U+00A0),
   o mesmo que o moeda() ja usa: o "mil" nunca quebra de linha sozinho.

   NULO NAO VIRA ZERO. numero() e moeda() devolvem "0" para vazio, e isso
   serve para dinheiro somado; aqui o numero e uma medida (alcance, leads), e
   medida nao informada nao e zero. Vazio, nulo e lixo devolvem "" e quem
   chama decide o que mostrar no lugar. */
const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const MOEDA_COMPACTA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
// Abaixo de mil, dinheiro sem centavos, como o moeda(): "R$ 950", e nao "R$ 950,5".
const MOEDA_COMPACTA_INTEIRA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 0,
});

function medidaOuNulo(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function numeroCompacto(v) {
  const n = medidaOuNulo(v);
  if (n === null) return "";
  // -0,01 arredondado sairia "-0": abaixo da casa mostrada, e zero.
  return COMPACTO.format(Math.abs(n) < 0.05 ? 0 : n);
}

export function moedaCompacta(v) {
  const n = medidaOuNulo(v);
  if (n === null) return "";
  if (Math.abs(n) < 1000) return MOEDA_COMPACTA_INTEIRA.format(Math.round(n) || 0);
  return MOEDA_COMPACTA.format(n);
}
