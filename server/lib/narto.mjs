// Narto Drama channel: a second adapter set beside Anichin/ReelShort-web. Narto aggregates many
// short-drama providers; each lives at <app>.narto-drama.com with its OWN, differently-nested JSON.
// Rather than hand-map every schema, this module walks each response for the first "drama-ish" and
// "episode-ish" arrays and any .m3u8 URL, then normalises to the app's Drama/EpisodePlay shapes.
// Only providers verified playable are wired as sources.
import { cache } from "./cache.mjs";
import { UA, request } from "./http.mjs";
import { recordHealth } from "./sources.mjs";

const TTL = { list: 5 * 60e3, detail: 10 * 60e3, episode: 90e3 };
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

const TITLE_KEYS = ["title", "book_title", "bookName", "name", "video_title", "video_name", "short_play_name", "shortPlayName", "drama_name", "playName", "book_sub_title"];
const ID_KEYS = ["id", "book_id", "bookId", "video_id", "short_play_id", "shortPlayId", "series_id", "seriesId", "program_id", "playlet_id", "vid", "movie_id", "resource_id", "key"];
const COVER_KEYS = ["cover", "big_cover", "gif_cover", "book_pic", "image_url", "cover_url", "compress_cover_url", "shortPlayCover", "thumbnail", "poster", "poster_url", "imageUrl", "horizontally_img", "titleImage", "bannerImage"];
const DESC_KEYS = ["description", "introduction", "introduce", "m_video_desc", "synopsis", "special_desc", "desc", "logLine", "summary"];
const TOTAL_KEYS = ["totalEpisodes", "chapter_count", "chapterCount", "episode_total", "episodeTotal", "episode_num", "upload_num", "totalChapter", "episodeCount", "episode_count", "total"];
const VIEW_KEYS = ["viewCount", "read_count", "collect_total", "favor_count", "collect_count", "heatScore", "play_count"];
const EPID_KEYS = ["chapterId", "chapter_id", "epis_id", "episode_id", "episodeId", "vid", "id"];
const EPNUM_KEYS = ["serialNumber", "chapterIndex", "episode_order", "episode", "episodeNo", "order", "number", "index"];

const firstString = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number" && v) return String(v);
  }
  return "";
};
const firstNum = (obj, keys) => {
  for (const k of keys) {
    const n = Number(obj?.[k]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 0;
};

// Breadth-first walk; among candidate arrays prefer the one that looks like a drama listing (many
// titles AND covers) so a channel wrapper like happyshort's categories never wins over its videos.
function itemArray(root) {
  const candidates = [];
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node) && node.length && node[0] && typeof node[0] === "object" && !Array.isArray(node[0])) {
      const titled = node.filter((o) => TITLE_KEYS.some((k) => typeof o[k] === "string" && o[k])).length;
      if (titled) {
        const covered = node.filter((o) => COVER_KEYS.some((k) => typeof o[k] === "string" && o[k])).length;
        candidates.push({ node, score: titled * 2 + covered });
      }
    }
    if (node && typeof node === "object") for (const v of Object.values(node)) queue.push(v);
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ? candidates[0].node : [];
}

// Same walk, for the episode list (objects carrying an episode-number/id field but no title-only shape).
function episodeArray(root) {
  const queue = [root];
  const seen = [];
  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node) && node.length && node[0] && typeof node[0] === "object") {
      seen.push(node);
    }
    if (node && typeof node === "object") for (const v of Object.values(node)) queue.push(v);
  }
  // Prefer the array with the most entries that look like episodes.
  let best = [];
  for (const arr of seen) {
    const score = arr.filter((o) => EPNUM_KEYS.some((k) => o[k] != null) && (EPID_KEYS.some((k) => o[k] != null) || o.chapterName)).length;
    if (score > best.length) best = arr;
  }
  return best;
}

function deepUrls(root, re) {
  const out = new Set();
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    if (typeof node === "string") {
      if (re.test(node)) out.add(node);
    } else if (Array.isArray(node)) {
      queue.push(...node);
    } else if (node && typeof node === "object") {
      queue.push(...Object.values(node));
    }
  }
  return [...out];
}

// Rank http(s) URLs found in a stream response: plain .m3u8 first, then play-ish field names
// (some CDNs return signed urls like `...?auth_key=` with no .m3u8 suffix, e.g. dramanova backupUrl).
function playUrls(root) {
  const found = [];
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string" && /^https?:\/\//i.test(value)) found.push({ key, url: value });
        else queue.push(value);
      }
    }
  }
  const score = (x) =>
    /\.m3u8/i.test(x.url) ? 3 : /^(backupUrl|url|playUrl|hlsUrl|videoUrl|src|masterUrl)$/i.test(x.key) ? 2 : /video|hls|m3u8|auth_key|\.mp4/i.test(x.url) ? 1 : 0;
  return found
    .filter((x) => score(x) > 0)
    .sort((a, b) => score(b) - score(a))
    .map((x) => x.url);
}

const toDrama = (o, source) => ({
  id: firstString(o, ID_KEYS),
  source,
  title: clean(firstString(o, TITLE_KEYS)),
  cover: firstString(o, COVER_KEYS),
  description: clean(firstString(o, DESC_KEYS)),
  tags: (Array.isArray(o?.categoryList) ? o.categoryList : Array.isArray(o?.labels) ? o.labels : [])
    .map((t) => clean(t?.name || t?.labelName || t))
    .filter(Boolean)
    .slice(0, 8),
  totalEpisodes: firstNum(o, TOTAL_KEYS),
  viewCount: firstNum(o, VIEW_KEYS),
  isCompleted: false,
});

// host + the three routes; providers differ (goodshort needs a language segment, flickreels a /api prefix).
export const PROVIDERS = {
  reelshort: { host: "reelshort.narto-drama.com", homePath: "/get-home", search: (q) => `/search/${encodeURIComponent(q)}`, stream: (id, c) => `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
  netshort: { host: "netshort.narto-drama.com", homePath: "/get-home", search: (q) => `/search/${encodeURIComponent(q)}`, stream: (id, c) => `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
  vyntage: { host: "vyntage.narto-drama.com", homePath: "/get-home", search: (q) => `/search/${encodeURIComponent(q)}`, stream: (id, c) => `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
  idrama: { host: "idrama.narto-drama.com", homePath: "/get-home", search: (q) => `/search/${encodeURIComponent(q)}`, stream: (id, c) => `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
  vigloo: { host: "vigloo.narto-drama.com", homePath: "/api/get-home-channels", search: (q) => `/api/search/${encodeURIComponent(q)}`, stream: (id, c) => `/api/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
  dramanova: { host: "dramanova.narto-drama.com", homePath: "/get-home", search: (q) => `/search/${encodeURIComponent(q)}`, stream: (id, c) => `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
  happyshort: { host: "happyshort.narto-drama.com", homePath: "/get-channels", search: (q) => `/search/${encodeURIComponent(q)}`, stream: (id) => `/get-stream/${encodeURIComponent(id)}` },
  pinedrama: { host: "pinedrama.narto-drama.com", homePath: "/get-home", search: (q) => `/search?q=${encodeURIComponent(q)}`, detail: (id) => `/get-detail?id=${encodeURIComponent(id)}`, stream: (id, c) => `/get-stream?id=${encodeURIComponent(id)}&ep=${encodeURIComponent(c)}` },
  moboreels: { host: "moboreels.narto-drama.com", homePath: "/get-foryou", search: (q) => `/search/${encodeURIComponent(q)}`, stream: (id, c) => `/get-stream/${encodeURIComponent(c)}` },
  goodshort: { host: "goodshort.narto-drama.com", homePath: "/get-home/en/1", search: (q) => `/search/en/${encodeURIComponent(q)}`, stream: (id, c) => `/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
  flickreels: { host: "flickreels.narto-drama.com", homePath: "/api/get-home/405", search: (q) => `/api/search/${encodeURIComponent(q)}`, detail: (id) => `/api/get-detail/${encodeURIComponent(id)}`, stream: (id, c) => `/api/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(c)}` },
};

const get = (host, path, channel) => request(`https://${host}${path}`, { attempts: 2, timeoutMs: 9000, channel });

// Signed CDN urls (…?auth_key=) carry no .m3u8 suffix; sniff the first bytes to tell HLS from MP4.
async function mediaKind(url) {
  if (/\.m3u8(\?|$)/i.test(url)) return "hls";
  if (/\.mp4(\?|$)/i.test(url)) return "mp4";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Range: "bytes=0-255" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const type = (res.headers.get("content-type") || "").toLowerCase();
    const head = Buffer.from((await res.arrayBuffer()) || new Uint8Array()).toString("utf8", 0, 32);
    return /mpegurl/i.test(type) || head.includes("#EXTM3U") ? "hls" : "mp4";
  } catch {
    return "mp4";
  }
}

function config(id) {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`narto: provider tidak dikenal ${id}`);
  return p;
}

export async function list(source) {
  const p = config(source);
  return cache.wrap(
    `nt:list:${source}`,
    TTL.list,
    async () => {
      try {
        const body = await get(p.host, p.homePath, `narto:${source}`);
        const items = itemArray(body).map((o) => toDrama(o, source)).filter((d) => d.id && d.title);
        recordHealth(`narto:${source}`, true);
        return { items, hasMore: false };
      } catch (err) {
        recordHealth(`narto:${source}`, false, err.message);
        throw err;
      }
    },
    { swr: true },
  );
}

export async function search(source, query) {
  const p = config(source);
  return cache.wrap(
    `nt:search:${source}:${query.toLowerCase()}`,
    TTL.list,
    async () => {
      let body;
      for (const path of [p.search(query), `/search?keyword=${encodeURIComponent(query)}`, `/search?query=${encodeURIComponent(query)}`]) {
        try {
          body = await get(p.host, path, `narto:${source}`);
          break;
        } catch (err) {
          if (err.status !== 404) throw err;
        }
      }
      if (!body) throw Object.assign(new Error(`narto ${source}: search gagal`), { status: 502 });
      const items = itemArray(body).map((o) => toDrama(o, source)).filter((d) => d.id && d.title);
      recordHealth(`narto:${source}`, true);
      return { items };
    },
    { swr: true },
  );
}

export function detail(source, id) {
  const p = config(source);
  return cache.wrap(
    `nt:detail:${source}:${id}`,
    TTL.detail,
    async () => {
      const body = await get(p.host, p.detail ? p.detail(id) : `/get-detail/${encodeURIComponent(id)}`, `narto:${source}`);
      const drama = { ...toDrama(itemArray({ d: body })[0] || body.data || body.detail || body, source), source, id: String(id) };
      const eps = episodeArray(body);
      const episodes = eps.length
        ? eps.map((c, i) => ({
            number: firstNum(c, EPNUM_KEYS) || i + 1,
            title: clean(firstString(c, ["chapterName", "title", "name"])) || `Episode ${i + 1}`,
            locked: c.isLock === 1 || c.locked === true || Number(c.isCharge) === 1,
            chapterId: firstString(c, EPID_KEYS),
          }))
        : Array.from({ length: drama.totalEpisodes || 0 }, (_, i) => ({ number: i + 1, title: `Episode ${i + 1}`, locked: false }));
      if (!drama.totalEpisodes) drama.totalEpisodes = episodes.length;
      recordHealth(`narto:${source}`, true);
      return { ...drama, episodes };
    },
    { swr: true },
  );
}

export function episode(source, id, ep) {
  const p = config(source);
  return cache.wrap(`nt:episode:${source}:${id}:${ep}`, TTL.episode, async () => {
    // Some channels (e.g. happyshort) ship the per-episode m3u8 inside the detail response, so read
    // it there first and only fall back to the channel's stream route.
    const detailPath = p.detail ? p.detail(id) : `/get-detail/${encodeURIComponent(id)}`;
    const raw = await get(p.host, detailPath, `narto:${source}`).catch(() => null);
    const eps = raw ? episodeArray(raw) : [];
    const pick = eps.find((c, i) => (firstNum(c, EPNUM_KEYS) || i + 1) === Number(ep)) || eps[Number(ep) - 1];
    let urls = pick ? playUrls(pick).filter((u) => /\.m3u8|\.mp4/i.test(u)) : [];
    if (!urls.length) {
      const candidates = [...new Set([pick ? firstString(pick, EPID_KEYS) : "", pick ? firstNum(pick, EPNUM_KEYS) : 0, Number(ep)].filter((v) => v != null && v !== "" && v !== 0))];
      for (const c of candidates) {
        try {
          urls = playUrls(await get(p.host, p.stream(id, c), `narto:${source}`));
          if (urls.length) break;
        } catch {
          // try the next candidate (chapterId vs episode number)
        }
      }
    }
    if (!urls.length) throw Object.assign(new Error(`narto ${source}: tidak ada stream`), { status: 502 });
    const m3u8 = urls[0];
    recordHealth(`narto:${source}`, true);
    return {
      source,
      id: String(id),
      number: Number(ep),
      locked: false,
      url: m3u8,
      type: await mediaKind(m3u8),
      qualities: urls.slice(0, 4).map((u) => ({ label: "Auto", url: u })),
      subtitles: [],
    };
  });
}
