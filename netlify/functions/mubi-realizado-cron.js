// Cron: dispara a background do fluxo realizado mes a mes. Roda de madrugada
// (04:30 UTC = 01:30 de Brasilia), antes da recarga completa das 06:00, quando
// o Mubisys responde rapido. Fire-and-forget.

export const handler = async () => {
  const base = process.env.URL || "https://impresilk.netlify.app";
  try {
    const resp = await fetch(`${base}/.netlify/functions/mubi-realizado-background`, {
      method: "POST",
      headers: { "x-token": process.env.TOKEN || "" },
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true, disparo: resp.status }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erro: e.message }) };
  }
};
