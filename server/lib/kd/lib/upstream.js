// Port of NANDA DRACIN lib/upstream.js for the adapters in ../sources (copied verbatim from that project,
// which is why this file keeps its path and exports: `upstream`, `UpstreamError`, `fresh`, `baseUrl`).
// Calls https://<source>.narto-drama.com<prefix><path>. Differences from the original:
// - UpstreamError is a Zen HttpError flagged `upstream`; `transport: true` marks failures of the provider
//   itself (network error, timeout, gateway 52x or a non-JSON 5xx) as opposed to the provider's own JSON error
//   or empty data, so health can tell them apart.
// - Calls queue per source AND per lane (see `inLane`; kd.mjs uses home:<lang> and search:<lang>): background home loads and search fan-outs cannot
//   starve the detail/episode calls a viewer is waiting on.
// - Default timeout is 11 s measured from the call, so time spent queued counts; an adapter's explicit
//   `timeout` (mydrama home 70 s, reelbuzz streams 45 s) is kept.
// - The 520-524 retry is skipped while the source's health channel (`kd:<id>`, `en:<id>` for English) is down, or when no time is left.
// - Expired cache entries are dropped on read; the cache and response bodies are capped.
// - Content language (`withLang` / `contentLang` / `langValue`): kd.mjs runs every adapter call inside
//   withLang('id'|'en'); adapters map it to their upstream value. The URL cache keys on the full URL, so a
//   language that changes the query never shares an entry with another.

import { AsyncLocalStorage } from 'node:async_hooks';
import { HttpError, createLimiter } from '../../http.mjs';
import { channelStatus } from '../../sources.mjs';

const CACHE_LIMIT = 1000;
const BODY_LIMIT = 5 * 1024 * 1024;
const CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 11000;

const cache = new Map();
const inflight = new Map();
const limiters = new Map();
const bypass = new AsyncLocalStorage();
const lanes = new AsyncLocalStorage();
const langs = new AsyncLocalStorage();

/** Run fn without our cache and with a cache-busting query so Narto's own cache is skipped too. */
export const fresh = (fn) => bypass.run(true, fn);

/** Run fn with its upstream calls queued in their own lane (kd.mjs: 'home:<lang>', 'search:<lang>'; default 'main'). */
export const inLane = (lane, fn) => lanes.run(lane, fn);

/** Run fn for one content language ('id' default, 'en'). */
export const withLang = (lang, fn) => langs.run(lang, fn);

/** Content language of the current adapter call. */
export const contentLang = () => langs.getStore() || 'id';

/** Upstream value for the current content language from an adapter's map; unknown -> the map's first entry. */
export const langValue = (map) => map[contentLang()] ?? Object.values(map)[0];

export class UpstreamError extends HttpError {
  constructor(message, status = 502, transport = false) {
    super(status, message);
    this.upstream = true;
    this.transport = transport;
  }
}

export function baseUrl(source, prefix = '') {
  return `https://${source}.narto-drama.com${prefix}`;
}

const limiterFor = (source) => {
  const key = `${source}|${lanes.getStore() || 'main'}`;
  let limit = limiters.get(key);
  if (!limit) limiters.set(key, (limit = createLimiter(CONCURRENCY)));
  return limit;
};

/**
 * GET JSON from upstream.
 * @param {string} source  subdomain, e.g. 'playlet'
 * @param {string} path    endpoint path, already encoded, e.g. '/get-home'
 * @param {object} [opts]
 * @param {object} [opts.query]   query string; undefined/null/'' values are skipped
 * @param {string} [opts.prefix]  '/api' for most of these providers
 * @param {number} [opts.ttl]     in-memory cache seconds (0 = no cache), default 300
 * @param {number} [opts.timeout] ms from the call (queue time included), default 11000
 */
export function upstream(source, path, opts = {}) {
  const { query = {}, prefix = '', ttl = 300 } = opts;
  const url = new URL(baseUrl(source, prefix) + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  if (bypass.getStore()) url.searchParams.set('_t', String(Date.now()));
  const key = url.toString();
  const hit = cache.get(key);
  if (hit) {
    if (hit.exp > Date.now()) return Promise.resolve(hit.data);
    cache.delete(key);
  }

  if (inflight.has(key)) return inflight.get(key);
  const deadline = Date.now() + (opts.timeout || DEFAULT_TIMEOUT_MS);
  // Read here: inside the limiter the async context may belong to whichever call freed the slot.
  const channel = `${contentLang() === 'en' ? 'en' : 'kd'}:${source}`;
  const p = limiterFor(source)(() => request(source, key, deadline, channel)).then((data) => {
    if (ttl > 0) {
      cache.set(key, { data, exp: Date.now() + ttl * 1000 });
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    }
    return data;
  });
  inflight.set(key, p);
  p.finally(() => inflight.delete(key)).catch(() => {});
  return p;
}

async function readBody(res, source) {
  if (Number(res.headers.get('content-length')) > BODY_LIMIT) {
    await res.body?.cancel().catch(() => {});
    throw new UpstreamError(`${source}: respons terlalu besar`, 502);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body || []) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new UpstreamError(`${source}: respons terlalu besar`, 502);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function request(source, key, deadline, channel) {
  // Cloudflare sometimes answers 520-524 for a moment; retry once unless the source is already down.
  const retries = channelStatus(channel) === 'down' ? 0 : 1;
  let res, text;
  for (let attempt = 0; ; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) throw new UpstreamError(`${source}: upstream tidak merespons (antrean)`, 504, true);
    try {
      res = await fetch(key, {
        headers: { accept: 'application/json', 'user-agent': 'KingDrama/1.0' },
        signal: AbortSignal.timeout(left),
      });
      text = await readBody(res, source);
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      throw new UpstreamError(`${source}: upstream tidak merespons (${e.name})`, 504, true);
    }
    if (attempt < retries && res.status >= 520 && res.status <= 524 && deadline - Date.now() > 1000) continue;
    break;
  }
  // Transport failure = the gateway answered for the provider (Cloudflare 52x, or a 5xx without a JSON body).
  // A JSON error is the provider's own answer, often per title (bibishort reports an unknown id as a JSON 500).
  const gateway = res.status >= 520 && res.status <= 524;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UpstreamError(`${source}: respons bukan JSON (HTTP ${res.status})`, 502, res.status >= 500);
  }
  if (!res.ok || data?.success === false) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new UpstreamError(`${source}: ${msg}`, res.status === 404 ? 404 : 502, gateway);
  }
  return data;
}
