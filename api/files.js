// Saved-files API backed by Vercel Blob (private store, OIDC auth).
// Metadata (id, date range, count) is encoded in the blob pathname so the
// list view never has to download every file.
import { list, put, del, get } from "@vercel/blob";
import { checkAuth } from "../lib/auth.js";

const PREFIX = "files/";
const FLAGS_PATH = "meta/pagedone.json"; // { [id]: true } — pages marked "done"

function pathnameFor(m) {
  return `${PREFIX}${m.id}__${m.dateMin}__${m.dateMax}__${m.count}.json`;
}
function metaFromPathname(pathname) {
  const base = pathname.replace(PREFIX, "").replace(/\.json$/, "");
  const [id, dateMin, dateMax, count] = base.split("__");
  return { id, dateMin, dateMax, count: Number(count) || 0 };
}
async function readJsonBlob(pathname) {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}
async function writeJsonBlob(pathname, obj) {
  // cacheControlMaxAge:0 => the blob CDN never caches this, so reads right after
  // a write are always fresh (no more "it didn't save" from a stale copy).
  await put(pathname, JSON.stringify(obj), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

export default async function handler(req, res) {
  if (!checkAuth(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    // ---- page-done flags (small shared blob) ----
    if (req.query && req.query.flags) {
      if (req.method === "GET") {
        res.setHeader("Cache-Control", "private, no-store");
        try {
          const flags = await readJsonBlob(FLAGS_PATH);
          return res.status(200).json(flags || {});
        } catch (_) {
          return res.status(200).json({});
        }
      }
      if (req.method === "POST" || req.method === "PUT") {
        await writeJsonBlob(FLAGS_PATH, req.body || {});
        return res.status(200).json({ ok: true });
      }
    }

    if (req.method === "GET") {
      const id = req.query && req.query.id;
      if (!id) {
        const { blobs } = await list({ prefix: PREFIX });
        const files = blobs
          .map((b) => ({ ...metaFromPathname(b.pathname), uploadedAt: b.uploadedAt }))
          .sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
        return res.status(200).json({ files });
      }
      const { blobs } = await list({ prefix: `${PREFIX}${id}__` });
      if (!blobs.length) return res.status(404).json({ error: "not found" });
      // Private blobs aren't fetchable by URL; read content via get().
      const data = await readJsonBlob(blobs[0].pathname);
      if (data == null) return res.status(404).json({ error: "not found" });
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json(data);
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = req.body || {};
      const meta = {
        id: body.id,
        dateMin: body.dateMin || "00000000",
        dateMax: body.dateMax || "00000000",
        count: body.count || 0,
      };
      if (!meta.id) return res.status(400).json({ error: "missing id" });
      // Deterministic pathname per id (dateMin/dateMax/count are fixed at
      // upload time), so a plain overwrite is enough — no list()/del() needed.
      // This keeps each save to a SINGLE Blob "advanced operation".
      await writeJsonBlob(pathnameFor(meta), body);
      return res.status(200).json({ ok: true, id: meta.id });
    }

    if (req.method === "DELETE") {
      const id = req.query && req.query.id;
      if (!id) return res.status(400).json({ error: "missing id" });
      const { blobs } = await list({ prefix: `${PREFIX}${id}__` });
      for (const b of blobs) await del(b.url);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,PUT,DELETE");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
