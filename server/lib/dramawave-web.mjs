import crypto from "node:crypto";

import { cache } from "./cache.mjs";
import { HttpError, UA, createLimiter, request } from "./http.mjs";
import { recordHealth } from "./sources.mjs";

// SKYWORK's own backend behind m.mydramawave.com. The H5 SPA ships the AES passphrase in its
// crypt-web chunk (crypt-web-*.js): AES-128-CBC over raw passphrase bytes, IV = first 16 bytes of
// the base64 payload, CryptoJS-less WebCrypto (PKCS#7). The server also answers plaintext JSON
// when the "Skip-Encrypt: 1" request header is present, which is what this module relies on.
const API = "https://api.mydramawave.com";
const ORIGIN = "https://m.mydramawave.com";
const AES_KEY = "2r36789f45q01ae5";
// The SPA signs auth requests as md5("<secret>&<auth_secret>"); the prefix is a bundle constant.
const SIG_SECRET = "8IAcbWyCsVhYv82S2eofRqK1DF3nNDAv";
const APP_NAME = "com.dramawave.h5";
const APP_VERSION = "1.2.20";
const TTL = { series: 10 * 60e3, unlock: 90e3 };

// The backend rate-limits per device; keep concurrency low and space request starts.
const limit = createLimiter(2, 250);

const keyBuf = () => {
  const key = Buffer.alloc(16);
  Buffer.from(AES_KEY, "utf8").copy(key, 0, 0, 16);
  return key;
};

export function decryptBody(text) {
  const buf = Buffer.from(String(text), "base64");
  const decipher = crypto.createDecipheriv("aes-128-cbc", keyBuf(), buf.subarray(0, 16));
  return Buffer.concat([decipher.update(buf.subarray(16)), decipher.final()]).toString("utf8");
}

const parseBody = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(decryptBody(text));
  }
};

const md5 = (value) => crypto.createHash("md5").update(value).digest("hex");

// The SPA keys every device by md5(userAgent + 16 random chars) and sends it as device-hash/device-id.
const deviceId = md5(UA + crypto.randomBytes(16).toString("hex").slice(0, 16));
let session = null;

const baseHeaders = () => ({
  "User-Agent": UA,
  Accept: "application/json",
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`,
  device: "h5",
  "device-id": deviceId,
  "device-hash": deviceId,
  "app-name": APP_NAME,
  "app-version": APP_VERSION,
  "Skip-Encrypt": "1",
});

const authHeader = (key, secret) => `oauth_signature=${md5(`${SIG_SECRET}&${secret}`)},oauth_token=${key},ts=${Date.now()}`;

async function login() {
  if (session) return session;
  const res = await limit(() =>
    fetch(`${API}/h5-api/anonymous/login`, {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId }),
      signal: AbortSignal.timeout(8000),
    }),
  );
  const body = parseBody(await res.text());
  const data = body?.data;
  if (!data?.auth_key || !data?.auth_secret) throw new HttpError(502, "dramawave: anonymous login failed", true);
  session = { key: data.auth_key, secret: data.auth_secret };
  return session;
}

async function callApi(path, { method = "GET", body } = {}, retry = true) {
  const creds = await login();
  const headers = { ...baseHeaders(), authorization: authHeader(creds.key, creds.secret) };
  let text;
  if (method === "POST") {
    const res = await limit(() =>
      fetch(`${API}${path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      }),
    );
    text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `dramawave upstream ${res.status} ${path}`, res.status >= 500);
  } else {
    text = await request(`${API}${path}`, { as: "text", attempts: 2, timeoutMs: 8000, limit, headers });
  }
  const parsed = parseBody(text);
  // The guest token can go stale; one silent re-login keeps the module stateless to callers.
  if (retry && parsed?.code === 401) {
    session = null;
    return callApi(path, { method, body }, false);
  }
  return parsed;
}

export function seriesInfo(seriesId) {
  return cache.wrap(
    `dw:info:${seriesId}`,
    TTL.series,
    async () => {
      const body = await callApi(`/h5-api/drama/info?series_id=${encodeURIComponent(seriesId)}`);
      const info = body?.data?.info;
      if (!info?.episode_list) throw new HttpError(404, "DramaWave: seri tidak ditemukan");
      return info;
    },
    { swr: true },
  );
}

const streamOf = (ep) => ep?.external_audio_h264_m3u8 || ep?.m3u8_url || ep?.video_url || ep?.external_audio_h265_m3u8 || "";
const typeOf = (url) => (/\.m3u8(\?|$)/i.test(url) ? "hls" : "mp4");

function subsOf(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => ({
      label: String(s?.label || s?.language || s?.lang || ""),
      language: String(s?.language || s?.lang || ""),
      url: String(s?.url || s?.src || ""),
    }))
    .filter((s) => s.url);
}

// A free-window episode already carries its stream; a paid one answers code 1000 "Balance not
// enough" (or 1018 when jumped out of order), so there is no anonymous free path for it.
async function unlock(seriesId, episodeId) {
  const body = await callApi("/h5-api/drama/unlock_episode", {
    method: "POST",
    body: { series_id: seriesId, episode_id: episodeId, check_auto_unlock: 1, auto_unlock: 1 },
  });
  return streamOf(body?.data) ? body.data : null;
}

export async function episode(seriesId, epNumber) {
  const number = Number(epNumber);
  if (!seriesId || !Number.isInteger(number) || number < 1) return null;
  try {
    const info = await seriesInfo(seriesId);
    // The backend answered (even a paywalled episode means it is reachable and healthy).
    recordHealth("web:dramawave", true);
    const ep = info.episode_list.find((e) => Number(e.index) === number);
    if (!ep) return null;
    let source = ep;
    let stream = streamOf(ep);
    if (!stream) {
      const granted = await cache.wrap(`dw:unlock:${seriesId}:${number}`, TTL.unlock, () => unlock(seriesId, ep.id).catch(() => null));
      if (granted) {
        source = granted;
        stream = streamOf(granted);
      }
    }
    if (!stream) return null;
    const subtitles = subsOf(source.subtitle_list);
    return { url: stream, type: typeOf(stream), ...(subtitles.length ? { subtitles } : {}) };
  } catch (err) {
    if (err.status !== 404) recordHealth("web:dramawave", false, err.message);
    return null;
  }
}
