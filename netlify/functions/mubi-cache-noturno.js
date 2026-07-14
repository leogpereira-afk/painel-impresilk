// Cron noturno (03:00 de Brasilia, agendado no netlify.toml): dispara a recarga
// COMPLETA do cache do Mubisys, aproveitando a madrugada (a API voa sem carga).

export const handler = async () => {
  const base = process.env.URL || "https://painel-impresilk.netlify.app";
  try {
    const resp = await fetch(`${base}/.netlify/functions/mubi-cache-background?modo=completo`, {
      method: "POST",
      headers: { "x-token": process.env.TOKEN || "" },
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true, disparo: resp.status }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erro: e.message }) };
  }
};
