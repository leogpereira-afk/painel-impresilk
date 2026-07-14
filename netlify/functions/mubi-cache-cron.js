// Cron (agendado no netlify.toml, a cada 20 minutos): dispara a background
// function que atualiza o cache do Mubisys no Blobs. O disparo e fire-and-forget
// (a background devolve 202 na hora e trabalha por conta propria).

export const handler = async () => {
  const base = process.env.URL || "https://painel-impresilk.netlify.app";
  try {
    const resp = await fetch(`${base}/.netlify/functions/mubi-cache-background`, {
      method: "POST",
      headers: { "x-token": process.env.TOKEN || "" },
    });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, disparo: resp.status }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erro: e.message }) };
  }
};
