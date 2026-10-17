import { cache } from "./cache.mjs";
import { ANICHIN_ORIGIN, createLimiter, request } from "./http.mjs";
import { recordHealth } from "./sources.mjs";

const API = `${ANICHIN_ORIGIN}/api`;
const TTL = { list: 5 * 60e3, detail: 10 * 60e3, episode: 90e3 };

// Anichin answers bursts with {"error":"forbidden"}: keep few requests in flight and space their starts.
const limit = createLimiter(3, 150);

export const absolute = (url) => (typeof url === "string" && url.startsWith("/") ? ANICHIN_ORIGIN + url : url || "");

const itemsOf = (body) => body?.items || body?.rows || (Array.isArray(body?.data) ? body.data : []);

async function call(source, endpoint, params, attempts = 3) {
  const query = new URLSearchParams(params).toString();
  const url = `${API}/${source}/${endpoint}${query ? `?${query}` : ""}`;
  try {
    const body = await request(url, { attempts, limit, channel: `anichin:${source}` });
    if (body.code && Number(body.code) !== 200) throw new Error(`anichin code ${body.code} ${source}/${endpoint}`);
    recordHealth(`anichin:${source}`, true);
    return body;
  } catch (err) {
    if (err.status !== 404) recordHealth(`anichin:${source}`, false, err.message);
    throw err;
  }
}

export function list(source, type, page = 1, attempts) {
  return cache.wrap(
    `an:list:${source}:${type}:${page}`,
    TTL.list,
    async () => {
      const body = await call(source, type, { page }, attempts);
      return { items: itemsOf(body), hasMore: Boolean(body.hasMore) };
    },
    { swr: true },
  );
}

export function search(source, query, page = 1, attempts) {
  return cache.wrap(
    `an:search:${source}:${query.toLowerCase()}:${page}`,
    TTL.list,
    async () => {
      const body = await call(source, "search", { query, page }, attempts);
      return { items: itemsOf(body), hasMore: Boolean(body.hasMore) };
    },
    { swr: true },
  );
}

export function detail(source, id, attempts) {
  return cache.wrap(
    `an:detail:${source}:${id}`,
    TTL.detail,
    async () => {
      const body = await call(source, "detail", { id }, attempts);
      const data = body.data && typeof body.data === "object" ? body.data : body;
      if (!data.title && !data.id && !data.dramaId) throw new Error(`anichin empty detail ${source}/${id}`);
      return data;
    },
    { swr: true },
  );
}

export function episode(source, id, ep, attempts) {
  return cache.wrap(`an:episode:${source}:${id}:${ep}`, TTL.episode, () => call(source, "episode", { id, ep }, attempts));
}
