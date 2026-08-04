// ============================================================================
// A IDADE DO DADO — um dono só.
//
// Isto morava dentro do Layout.jsx e tinha um único consumidor: o chip do canto
// do cabeçalho. Em 03-04/08/2026 o cache ficou 30 horas parado, o chip DISSE a
// verdade ("dados de 03/08 as 10:44 · parado") e ninguém viu — a hierarquia da
// tela ensina a ler o número grande de dinheiro e ignorar o canto. Pior: o chip
// tem a classe `sem-impressao`, então no PDF de cobrança sobrava só "Emitido em
// <hoje>" em cima de números de anteontem.
//
// Virou lib porque agora tem três consumidores (o chip, o aviso no corpo das
// telas de dinheiro e o cabeçalho de impressão) e o limiar de "parado" não pode
// ser reescrito em cada um — dois donos do mesmo parâmetro é cicatriz que este
// código já tem em outros lugares.
// ============================================================================

/** Acima disto o cache não está atrasado, está PARADO: o cron roda a cada 20 min. */
export const PARADO_MIN = 180;
/** Acima disto já passou do ciclo normal, mas ainda pode ser uma rodada perdida. */
export const VELHO_MIN = 40;

const TZ = "America/Sao_Paulo";

export function frescor(iso, agora = Date.now()) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;

  const idadeMin = Math.round((agora - dt.getTime()) / 60000);
  const hhmm = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const dia = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });

  let texto;
  if (idadeMin < 60) texto = `dados de ${hhmm}`;
  else if (idadeMin < 60 * 20) texto = `dados de ${hhmm} (ha ${Math.floor(idadeMin / 60)}h)`;
  else texto = `dados de ${dia} as ${hhmm}`;

  return {
    hhmm,
    dia,
    texto,
    /** "de 03/08 as 10:44" — a forma completa, para frase e para papel. */
    quando: `${dia} as ${hhmm}`,
    velho: idadeMin > VELHO_MIN,
    parado: idadeMin > PARADO_MIN,
    idadeMin,
  };
}

/** "ha 30h" / "ha 45 min" — a idade em palavras, para a frase do aviso. */
export function idadeEmPalavras(idadeMin) {
  if (!Number.isFinite(idadeMin)) return "";
  if (idadeMin < 90) return `ha ${Math.max(1, idadeMin)} min`;
  const horas = Math.round(idadeMin / 60);
  if (horas < 48) return `ha ${horas}h`;
  return `ha ${Math.round(horas / 24)} dias`;
}
