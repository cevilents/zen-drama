const STALE_LIMIT_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 3000;

const store = new Map();
const inflight = new Map();

function set(key, value, ttlMs) {
  store.delete(key);
  store.set(key, { value, expires: Date.now() + ttlMs });
  if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  const now = Date.now();
  if (now > entry.expires + STALE_LIMIT_MS) {
    store.delete(key);
    return undefined;
  }
  return { value: entry.value, fresh: now <= entry.expires };
}

function load(key, ttlMs, loader) {
  let pending = inflight.get(key);
  if (!pending) {
    pending = Promise.resolve()
      .then(loader)
      .then((value) => {
        set(key, value, ttlMs);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

// Fresh hit -> cached value. Miss -> load (concurrent callers share one upstream call).
// Expired entry -> with `swr` return it immediately and refresh in the background,
// otherwise try to reload and fall back to the stale value only if loading fails.
// `staleLimitMs` caps how old an expired entry may be to still be served that way (default: the 6 h store limit).
async function wrap(key, ttlMs, loader, { swr = false, staleLimitMs = STALE_LIMIT_MS } = {}) {
  const hit = get(key);
  if (hit?.fresh) return hit.value;
  const usable = hit && Date.now() <= store.get(key).expires + staleLimitMs;
  if (usable && swr) {
    load(key, ttlMs, loader).catch(() => {});
    return hit.value;
  }
  try {
    return await load(key, ttlMs, loader);
  } catch (err) {
    if (usable) return hit.value;
    throw err;
  }
}

export const cache = { get, set, wrap };
