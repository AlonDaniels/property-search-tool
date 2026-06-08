// Serverless proxy for BatchData. The token lives in the BATCHDATA_TOKEN
// environment variable on Vercel and is never sent to the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const token = process.env.BATCHDATA_TOKEN;
  if (!token) {
    return res
      .status(500)
      .json({ error: "BATCHDATA_TOKEN is not set in the Vercel environment." });
  }

  try {
    // The page sends the full BatchData payload, e.g. { requests: [{ address }] }
    const upstream = await fetch(
      "https://api.batchdata.com/api/v1/property/lookup/all-attributes",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body || {}),
      }
    );

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Failed to reach BatchData", detail: String(err) });
  }
}
