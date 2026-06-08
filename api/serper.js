// Serverless proxy for Serper. The API key lives in the SERPER_API_KEY
// environment variable on Vercel and is never sent to the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return res
      .status(500)
      .json({ error: "SERPER_API_KEY is not set in the Vercel environment." });
  }

  try {
    // Forward whatever payload the page sent (q, num, page, gl, hl, type, ...)
    const upstream = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": key,
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Failed to reach Serper", detail: String(err) });
  }
}
