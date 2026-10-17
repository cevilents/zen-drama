import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { HttpError, headersFor, isAnichinHost } from "./http.mjs";

const MAX_REDIRECTS = 5;
const MAX_INDIRECTIONS = 2;
const PLAYLIST_LIMIT = 4 * 1024 * 1024;
const JSON_LIMIT = 256 * 1024;
const HEADERS_TIMEOUT_MS = 15000;
const HOST_CHECK_TTL_MS = 5 * 60e3;
const SIG_LENGTH = 22;
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag", "cache-control"];

// Without PROXY_SECRET the key is per-process: signed URLs stop working after a restart (caches reset too).
const SECRET = process.env.PROXY_SECRET || crypto.randomBytes(32);

const sign = (url) => crypto.createHmac("sha256", SECRET).update(url).digest("base64url").slice(0, SIG_LENGTH);

export function hasValidSig(url, sig) {
  if (!url || !sig) return false;
  const a = Buffer.from(sign(url));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const proxify = (base, url) => `${base}/api/proxy?url=${encodeURIComponent(url)}&sig=${sign(url)}`;

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

const hostChecks = new Map();

async function assertPublic(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "Hanya URL http/https yang didukung");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal)$/.test(host)) throw new HttpError(403, "Host tidak diizinkan");
  const cached = hostChecks.get(host);
  if (cached && Date.now() - cached.at < HOST_CHECK_TTL_MS) {
    if (!cached.ok) throw new HttpError(403, "Host tidak diizinkan");
    return;
  }
  let addresses;
  try {
    addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new HttpError(502, `Host tidak dapat di-resolve: ${host}`);
  }
  const ok = !addresses.some(isPrivateAddress);
  hostChecks.set(host, { ok, at: Date.now() });
  if (!ok) throw new HttpError(403, "Host tidak diizinkan");
}

function parseTarget(raw) {
  if (!raw) throw new HttpError(400, "Parameter url wajib diisi");
  try {
    return new URL(raw);
  } catch {
    throw new HttpError(400, "Parameter url tidak valid");
  }
}

// Follows redirects by hand so every hop passes the SSRF check and gets host-specific headers.
async function openUpstream(start, { range, signal }) {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(current);
    const headers = headersFor(current.href);
    if (range && !isAnichinHost(current.hostname)) headers.Range = range;
    const res = await fetch(current, { headers, redirect: "manual", signal });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      current = new URL(location, current);
      continue;
    }
    return { upstream: res, finalUrl: current };
  }
  throw new HttpError(508, "Terlalu banyak redirect");
}

async function readHead(reader, minBytes = 16) {
  const chunks = [];
  let size = 0;
  while (size < minBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  return Buffer.concat(chunks);
}

async function readAll(reader, head, maxBytes) {
  const chunks = [head];
  let size = head.length;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(502, "Respons upstream terlalu besar");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const waitDrain = (res) =>
  new Promise((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.on("drain", done);
    res.on("close", done);
  });

async function pipeBody(reader, head, res) {
  if (head.length && !res.write(head)) await waitDrain(res);
  while (!res.destroyed) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(value)) await waitDrain(res);
  }
  if (res.destroyed) await reader.cancel().catch(() => {});
  else res.end();
}

export function rewritePlaylist(text, playlistUrl, base) {
  const wrap = (uri) => {
    const abs = new URL(uri, playlistUrl);
    return abs.protocol === "http:" || abs.protocol === "https:" ? proxify(base, abs.href) : uri;
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${wrap(uri)}"`);
      try {
        return wrap(t);
      } catch {
        return line;
      }
    })
    .join("\n");
}

// Only cue timing lines change ("1:02:03,456 --> ..." becomes "01:02:03.456 --> ..."); dialogue is left as is.
export function srtToVtt(text) {
  const body = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (body.startsWith("WEBVTT")) return body;
  const timing = (line) =>
    line.replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g, (_, h, m, sec, ms) => `${h.padStart(2, "0")}:${m}:${sec}.${ms}`);
  return `WEBVTT\n\n${body
    .split("\n")
    .map((line) => (line.includes("-->") ? timing(line) : line))
    .join("\n")}`;
}

function mediaHeaders(upstream, finalUrl) {
  const headers = {};
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  const type = (headers["content-type"] || "").toLowerCase();
  if (!type || type.startsWith("application/octet-stream") || type.startsWith("binary/")) {
    if (/\.mp4$/i.test(finalUrl.pathname)) headers["content-type"] = "video/mp4";
    else if (/\.ts$/i.test(finalUrl.pathname)) headers["content-type"] = "video/mp2t";
    else if (/\.vtt$/i.test(finalUrl.pathname)) headers["content-type"] = "text/vtt; charset=utf-8";
  }
  return headers;
}

function sendError(res, err) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const status = err instanceof HttpError ? err.status : 502;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: err instanceof HttpError ? err.message : `Gagal mengambil media: ${err.message}` }));
}

export async function proxyMedia(req, res, rawUrl, base) {
  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableFinished) controller.abort();
  };
  res.on("close", onClose);
  const headersTimer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT_MS);
  try {
    let target = parseTarget(rawUrl);
    // Subtitles are fetched whole (a partial .srt could not be converted to WebVTT).
    const range = /\.(srt|vtt)$/i.test(target.pathname) ? undefined : req.headers.range;
    for (let indirection = 0; ; indirection++) {
      const { upstream, finalUrl } = await openUpstream(target, { range, signal: controller.signal });
      if (!upstream.ok) {
        await upstream.body?.cancel().catch(() => {});
        throw new HttpError(upstream.status === 404 ? 404 : 502, `Upstream media ${upstream.status}`);
      }
      const type = (upstream.headers.get("content-type") || "").toLowerCase();
      const reader = upstream.body.getReader();
      const head = await readHead(reader);
      const start = head.subarray(0, 64).toString("utf8").trimStart();
      const isMedia = /^(video|audio|image)\//.test(type);

      // FlickReels-style indirection: the first hop answers {"url": "<real playlist>"},
      // sometimes labelled as a playlist, so the body decides.
      if (!isMedia && start.startsWith("{") && indirection < MAX_INDIRECTIONS) {
        const text = await readAll(reader, head, JSON_LIMIT);
        let next;
        try {
          next = JSON.parse(text)?.url;
        } catch {}
        if (typeof next === "string" && next) {
          target = new URL(next, finalUrl);
          continue;
        }
        clearTimeout(headersTimer);
        res.writeHead(upstream.status, { "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(req.method === "HEAD" ? undefined : text);
        return;
      }

      // SRT subtitles (velolo, cubetv, joyreels, candyjar) are served as WebVTT so players can load them.
      if (!isMedia && upstream.status === 200 && (/\.srt$/i.test(finalUrl.pathname) || /^\d+\r?\n\d{1,2}:\d{2}:\d{2},\d{3} -->/.test(start.replace(/^\uFEFF/, "")))) {
        const vtt = srtToVtt(await readAll(reader, head, PLAYLIST_LIMIT));
        clearTimeout(headersTimer);
        res.writeHead(200, {
          "Content-Type": "text/vtt; charset=utf-8",
          "Content-Length": Buffer.byteLength(vtt),
          "Cache-Control": "public, max-age=3600",
        });
        res.end(req.method === "HEAD" ? undefined : vtt);
        return;
      }

      if (type.includes("mpegurl") || start.startsWith("#EXTM3U")) {
        const playlist = rewritePlaylist(await readAll(reader, head, PLAYLIST_LIMIT), finalUrl, base);
        clearTimeout(headersTimer);
        res.writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Content-Length": Buffer.byteLength(playlist),
          "Cache-Control": "no-store",
        });
        res.end(req.method === "HEAD" ? undefined : playlist);
        return;
      }

      clearTimeout(headersTimer);
      res.writeHead(upstream.status, mediaHeaders(upstream, finalUrl));
      if (req.method === "HEAD") {
        await reader.cancel().catch(() => {});
        res.end();
        return;
      }
      await pipeBody(reader, head, res);
      return;
    }
  } catch (err) {
    if (controller.signal.aborted && res.destroyed) return;
    sendError(res, err.name === "AbortError" ? new HttpError(504, "Upstream media timeout") : err);
  } finally {
    clearTimeout(headersTimer);
    res.off("close", onClose);
  }
}
