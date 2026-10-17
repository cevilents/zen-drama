import http from "node:http";
import os from "node:os";
import * as catalog from "./lib/catalog.mjs";
import { HttpError } from "./lib/http.mjs";
import { PROXY_ALL } from "./lib/kd.mjs";
import { langOf } from "./lib/lang.mjs";
import { hasValidSig, proxyMedia } from "./lib/proxy.mjs";
import { SOURCES, hasLang, sourceStatus, statusFor } from "./lib/sources.mjs";

const PORT = Number(process.env.PORT) || 3030;
const HOST = process.env.HOST || "0.0.0.0";
const WARM_UP_INTERVAL_MS = 10 * 60e3;
const RATE_WINDOW_MS = 60e3;
const RATE_LIMIT_MEDIA = Number(process.env.RATE_LIMIT_MEDIA) || 1200;
const RATE_LIMIT_API = Number(process.env.RATE_LIMIT_API) || 120;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

const pageOf = (query) => Math.max(1, Math.min(500, Number.parseInt(query.get("page") || "1", 10) || 1));

// Content language (docs/LANG_CONTRACT.md): every route below except /api/health takes lang=id|en (default id).
const jsonRoutes = {
  "/api/health": () => ({
    ok: true,
    sources: Object.fromEntries(SOURCES.map((s) => [s.id, sourceStatus(s.id)])),
  }),
  "/api/sources": (q, _base, lang) => ({
    items: SOURCES.filter((s) => lang === "id" || hasLang(s.id, lang)).map((s) => ({
      id: s.id,
      name: s.name,
      healthy: statusFor(s.id, lang) !== "down",
      langs: s.langs,
    })),
  }),
  "/api/home": (q, _base, lang) => catalog.home(lang),
  "/api/list": (q, _base, lang) => catalog.list(q.get("source"), q.get("type") || "trending", pageOf(q), lang),
  "/api/feed": (q, _base, lang) => catalog.feed(pageOf(q), lang),
  "/api/search": (q, _base, lang) => catalog.search(q.get("q"), q.get("source"), lang),
  // The catalog of a detail/episode comes from the id suffix (`~en`); `lang` only orders episode subtitles.
  "/api/detail": (q) => catalog.detail(q.get("source"), q.get("id")),
  "/api/episode": (q, base, lang) => catalog.episode(q.get("source"), q.get("id"), q.get("ep"), base, lang),
};

// Fixed-window counters per client and bucket; `media` = /api/proxy.
const rateHits = new Map();

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function clientKey(req) {
  const remote = req.socket.remoteAddress || "unknown";
  // Forwarded headers are only trustworthy when they come from the local tunnel (cloudflared).
  if (!LOOPBACK.has(remote)) return remote;
  const forwarded = req.headers["x-forwarded-for"];
  return req.headers["cf-connecting-ip"] || (forwarded && String(forwarded).split(",")[0].trim()) || remote;
}

// Returns seconds to wait when over the limit, otherwise 0.
function rateLimited(req, bucket, limit) {
  const key = `${bucket}|${clientKey(req)}`;
  const now = Date.now();
  let hit = rateHits.get(key);
  if (!hit || now >= hit.resetAt) {
    hit = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateHits.set(key, hit);
  }
  return ++hit.count > limit ? Math.max(1, Math.ceil((hit.resetAt - now) / 1000)) : 0;
}

function sendJson(res, status, body, extraHeaders) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function responseStatus(err) {
  if (!(err instanceof HttpError)) return 502;
  if (err.upstream) return err.status === 404 ? 404 : err.status === 504 ? 504 : 502;
  return err.status;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const host = req.headers.host || `localhost:${PORT}`;
  const base = `${req.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${host}`;
  for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value);
  let url;
  try {
    url = new URL(req.url, base);
  } catch {
    sendJson(res, 400, { error: "URL tidak valid" });
    return;
  }

  res.on("finish", () => {
    if (url.pathname !== "/api/proxy" || res.statusCode >= 400) {
      console.log(`${req.method} ${url.pathname}${url.search.length > 120 ? "?…" : url.search} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method tidak didukung" });
    return;
  }

  if (url.pathname.startsWith("/api/") && url.pathname !== "/api/health") {
    const media = url.pathname === "/api/proxy";
    const retryAfter = rateLimited(req, media ? "media" : "api", media ? RATE_LIMIT_MEDIA : RATE_LIMIT_API);
    if (retryAfter) {
      sendJson(res, 429, { error: "Terlalu banyak permintaan" }, { "Retry-After": retryAfter });
      return;
    }
  }

  if (url.pathname === "/api/proxy") {
    const target = url.searchParams.get("url");
    if (!hasValidSig(target, url.searchParams.get("sig"))) {
      sendJson(res, 403, { error: "Signature tidak valid" });
      return;
    }
    return proxyMedia(req, res, target, base);
  }

  const handler = jsonRoutes[url.pathname];
  if (!handler) {
    sendJson(res, 404, { error: `Endpoint tidak ditemukan: ${url.pathname}` });
    return;
  }
  try {
    sendJson(res, 200, await handler(url.searchParams, base, langOf(url.searchParams.get("lang"))));
  } catch (err) {
    const status = responseStatus(err);
    if (status >= 500) console.error(`${url.pathname}${url.search}: ${err.message}`);
    sendJson(res, status, { error: err.message || "Kesalahan upstream" });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} sudah dipakai proses lain. Hentikan proses itu (lsof -i :${PORT}) atau jalankan: PORT=3031 npm start`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => `http://${a.address}:${PORT}`);
  console.log(`ZEN DRAMA server listening on http://${HOST}:${PORT}`);
  if (lan.length) console.log(`LAN: ${lan.join("  ")}`);
  console.log(
    PROXY_ALL
      ? "Streams: PROXY_ALL, every video goes through /api/proxy"
      : "Streams: CORS-enabled CDNs play directly, the rest through /api/proxy (PROXY_ALL=1|true|yes proxies everything)",
  );
  catalog.warmUp();
  setInterval(() => catalog.warmUp(), WARM_UP_INTERVAL_MS).unref();
  setInterval(() => {
    const now = Date.now();
    for (const [key, hit] of rateHits) if (now >= hit.resetAt) rateHits.delete(key);
  }, RATE_WINDOW_MS).unref();
});
