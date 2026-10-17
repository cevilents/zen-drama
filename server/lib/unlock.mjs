import { ANICHIN_ORIGIN, createLimiter, request } from "./http.mjs";

const API = `${ANICHIN_ORIGIN}/api`;
const SEED_TTL_MS = 10 * 60e3;

// Sources whose locked episodes still resolve through an upstream /hls endpoint.
// idrama and dramawave were probed: /{source}/hls answers 502 (Cloudflare HTML) for both a
// real locked episode and a bogus one, i.e. no resolver, so they stay out.
export const UNLOCKABLE = new Set(["dramabox", "shortmax", "goodshort"]);

// Anichin answers bursts with {"error":"forbidden"}: keep few requests in flight and space their starts.
const limit = createLimiter(3, 150);

const seeds = new Map();

const linesOf = (text) => String(text || "").split(/\r?\n/).map((line) => line.trim());
const firstUri = (text) => linesOf(text).find((line) => line && !line.startsWith("#")) || "";

const hlsText = (url) => request(url, { as: "text", limit });
const isPlaylist = (text) => /#EXTM3U/.test(text);

// The master playlist's variant lines embed an api_key that is already expired (401); the
// variant only plays once that param is dropped. It also points at a direct .mp4, not a stream.
async function dramabox(id, ep) {
  const master = await hlsText(`${API}/dramabox/hls?id=${encodeURIComponent(id)}&ep=${ep}`);
  const variant = firstUri(master);
  if (!variant) return null;
  const url = new URL(variant, ANICHIN_ORIGIN);
  url.searchParams.delete("api_key");
  const direct = firstUri(await hlsText(url.href));
  return direct ? { url: new URL(direct, url).href, type: "mp4" } : null;
}

async function shortmax(id, ep) {
  const url = `${API}/shortmax/hls?id=${encodeURIComponent(id)}&ep=${ep}&q=720p`;
  return isPlaylist(await hlsText(url)) ? { url, type: "hls" } : null;
}

function chapterIdOf(videoUrl) {
  try {
    return Number(new URL(videoUrl, ANICHIN_ORIGIN).searchParams.get("chapterId")) || 0;
  } catch {
    return 0;
  }
}

// Goodshort's chapterId is arithmetic: an unlocked episode's videoUrl exposes the seed, and
// chapterId(ep) = seed + (ep - 1). Books locked from ep1 expose no seed -> null (honest).
async function goodshortSeed(id) {
  const hit = seeds.get(id);
  if (hit && Date.now() < hit.expires) return hit.value;
  let value = 0;
  for (const ep of [1, 2, 3]) {
    const body = await request(`${API}/goodshort/episode?id=${encodeURIComponent(id)}&ep=${ep}`, { limit });
    const data = body?.data || body;
    const chapterId = chapterIdOf(data?.videoUrl);
    if (chapterId) {
      value = chapterId - (ep - 1);
      break;
    }
  }
  seeds.set(id, { value, expires: Date.now() + SEED_TTL_MS });
  return value;
}

async function goodshort(id, ep) {
  const seed = await goodshortSeed(id);
  if (!seed) return null;
  const url = `${API}/goodshort/hls?bookId=${encodeURIComponent(id)}&chapterId=${seed + (ep - 1)}&q=720p&lang=in`;
  return isPlaylist(await hlsText(url)) ? { url, type: "hls" } : null;
}

const RESOLVERS = { dramabox, shortmax, goodshort };

export async function resolveLocked(source, id, ep) {
  const resolve = RESOLVERS[source];
  const number = Number(ep);
  if (!UNLOCKABLE.has(source) || !resolve || !id || !Number.isInteger(number) || number < 1) return null;
  try {
    return await resolve(id, number);
  } catch {
    return null;
  }
}
