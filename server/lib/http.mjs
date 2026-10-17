import { channelStatus } from "./sources.mjs";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const ANICHIN_ORIGIN = "https://miniapp.anichin.bio";

const RETRY_DELAYS = [400, 1200];
const jitter = (ms) => Math.round(ms * (0.6 + Math.random() * 0.8));

export class HttpError extends Error {
  constructor(status, message, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export const isAnichinHost = (hostname) => hostname === "anichin.bio" || hostname.endsWith(".anichin.bio");

// Media hosts that need a Referer, as announced by a provider adapter's stream() (see kd.mjs).
const REFERER_LIMIT = 500;
const referers = new Map();

export function setReferer(url, referer) {
  const host = new URL(url).hostname;
  referers.delete(host);
  referers.set(host, referer);
  if (referers.size > REFERER_LIMIT) referers.delete(referers.keys().next().value);
}

// Anichin rejects requests without its own Referer/Origin; the CDNs it points to reject them (403).
export function headersFor(url) {
  const headers = { "User-Agent": UA, Accept: "*/*" };
  const { hostname } = new URL(url);
  if (isAnichinHost(hostname)) {
    headers.Referer = `${ANICHIN_ORIGIN}/`;
    headers.Origin = ANICHIN_ORIGIN;
  } else if (referers.has(hostname)) {
    headers.Referer = referers.get(hostname);
  }
  return headers;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolves with the promise's value, or undefined if it rejects or takes longer than `ms`.
// The underlying work keeps running so it can still fill caches.
export function within(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

export function createLimiter(max, minGapMs = 0) {
  const queue = [];
  let active = 0;
  let lastStart = 0;
  let timer = null;

  const pump = () => {
    while (active < max && queue.length) {
      const wait = lastStart + minGapMs - Date.now();
      if (wait > 0) {
        timer ??= setTimeout(() => {
          timer = null;
          pump();
        }, wait);
        return;
      }
      lastStart = Date.now();
      active++;
      const { fn, resolve, reject } = queue.shift();
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
}

const upstreamError = (status, message, retryable) => Object.assign(new HttpError(status, message, retryable), { upstream: true });

const isRetryableStatus = (status) => status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;

async function attempt(url, as, timeoutMs, headers) {
  const label = new URL(url).pathname;
  let res;
  let text;
  try {
    res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    text = await res.text();
  } catch (err) {
    const reason = err.name === "TimeoutError" ? "timeout" : err.cause?.code || err.message;
    throw upstreamError(504, `${reason} ${label}`, true);
  }
  if (!res.ok) throw upstreamError(res.status, `upstream ${res.status} ${label}`, isRetryableStatus(res.status));
  if (as === "text") return text;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw upstreamError(502, `invalid json ${label}`, true);
  }
  if (body && typeof body === "object" && body.error) {
    throw upstreamError(502, `upstream error "${body.error}" ${label}`, true);
  }
  return body;
}

export async function request(
  url,
  { as = "json", attempts = 3, timeoutMs = 8000, limit = (fn) => fn(), headers = headersFor(url), channel = "" } = {},
) {
  const tries = channel && channelStatus(channel) === "down" ? 1 : attempts;
  let lastError;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(jitter(RETRY_DELAYS[Math.min(i - 1, RETRY_DELAYS.length - 1)]));
    try {
      return await limit(() => attempt(url, as, timeoutMs, headers));
    } catch (err) {
      lastError = err;
      if (!err.retryable) break;
    }
  }
  throw lastError;
}
