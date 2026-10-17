import * as anichin from "./anichin.mjs";
import { cache } from "./cache.mjs";
import * as narto from "./narto.mjs";
import * as dw from "./dramawave-web.mjs";
import { HttpError, headersFor, within } from "./http.mjs";
import * as kd from "./kd.mjs";
import { splitId, subtitleList } from "./lang.mjs";
import {
  anichinEpisodes,
  codecOf,
  dedupe,
  dramaKey,
  episodeRefs,
  fromAnichin,
  fromBanner,
  fromReelshort,
  interleave,
  mergeDrama,
  preferH264,
  reelshortDetail,
} from "./normalize.mjs";
import { proxify } from "./proxy.mjs";
import * as rs from "./reelshort-web.mjs";
import { SOURCES, channelStatus, hasLang, isSource, itemLang, sourceName } from "./sources.mjs";
import { UNLOCKABLE, resolveLocked } from "./unlock.mjs";

// Upstream for these five never serves ep 6+ (paywall) and their /hls resolver 502s, so a locked
// episode is swapped to the same title on a fully-free source: the catalog stays playable end to end.
const LIMITED = new Set(["freereels", "netshort", "flickreels", "idrama", "dramawave"]);
// Providers served end to end by the Narto channel (verified playable) instead of Anichin.
const NARTO_SOURCES = new Set(["vyntage", "happyshort", "dramanova", "pinedrama", "netshort", "idrama", "goodshort", "flickreels"]);
// Narto-only channels: no Anichin counterpart, so a Narto miss cannot fall back to the aggregator.
const NARTO_ONLY = new Set(["vyntage", "happyshort", "dramanova", "pinedrama"]);
// These two are SKYWORK products: their locked episodes are looked up on the official backend before swapping.
const SELF_HOST = new Set(["dramawave", "freereels"]);
const SWAP_ORDER = ["dramabox", "shortmax", "goodshort", "reelshort"];
// Also swapped when nothing else resolves: goodshort's unlock needs one free episode as a chapterId
// seed, and many books are now locked upstream from ep 1, which leaves no seed at all.
const SWAP_FALLBACK = new Set([...LIMITED, "goodshort"]);
// Registered sources served end to end by the per-provider adapters (kd.mjs), in SOURCES order
// (Indonesian catalogs first). They have no Anichin counterpart, so they never enter anichinPicks.
const KD_ORDER = SOURCES.map((s) => s.id).filter(kd.has);
const KD_SOURCES = new Set(KD_ORDER);
const FEED_KD = 4;
const SEARCH_KD = 6;
const HOME_KD_ROWS = 8;
// English catalog (lang=en): every source with "en" in its langs, in SOURCES order, served by kd.mjs.
const EN_ORDER = SOURCES.map((s) => s.id).filter((id) => hasLang(id, "en"));
const FEED_EN = 6;
const SEARCH_EN = 10;
const HOME_EN_ROWS = 12;

const BUDGET_MS = 8000;
const FALLBACK_WAIT_MS = 6000;
const PAGE_SIZE = 20;
const FEED_PER_SOURCE = 8;
const LIST_TYPES = new Set(["trending", "latest", "foryou"]);
const ID_PATTERN = /^[\w-]{1,64}(~(id|en))?$/;
const ROMANCE = /cinta|ceo|romansa|romance|nikah|pengantin|miliarder|istri|suami|kekasih|presdir|bos\b/i;
const KNOWN_LIMIT = 5000;

// Every drama we have seen in a list, so detail can fill gaps (episode counts, tags) when upstream omits them.
const known = new Map();

function remember(items) {
  for (const d of items) {
    if (!d.id) continue;
    const key = dramaKey(d);
    known.set(key, mergeDrama(d, known.get(key)));
    if (known.size > KNOWN_LIMIT) known.delete(known.keys().next().value);
  }
  return items;
}

function assertSource(source) {
  if (!source) throw new HttpError(400, "Parameter source wajib diisi");
  if (!isSource(source)) throw new HttpError(400, `Source tidak dikenal: ${source}`);
}

function assertId(id) {
  if (!id || !ID_PATTERN.test(id)) throw new HttpError(400, "Parameter id tidak valid");
}

// Detail/episode: the catalog comes only from the id suffix (`~en` = English); a bare id is always the Indonesian
// catalog, whatever `lang` says (docs/LANG_CONTRACT.md). Returns the upstream id and that catalog language.
function parseId(source, id) {
  assertId(id);
  const { id: raw, lang } = splitId(id);
  const content = lang || "id";
  if (content === "en" && !hasLang(source, "en")) throw new HttpError(404, `${sourceName(source)} tidak punya katalog Inggris`);
  return { raw, content };
}

// Every Drama carries its content language; English-mode items already have it (kd.mjs).
const stamp = (d) => (d && !d.lang ? { ...d, lang: itemLang(d.source, "id") } : d);
const stampAll = (items) => items.map(stamp);

const anichinUsable = (source) => channelStatus(`anichin:${source}`) !== "down";
const kdUsable = (source) => channelStatus(`kd:${source}`) !== "down";
const kdHealthy = () => KD_ORDER.filter(kdUsable);
const enHealthy = () => EN_ORDER.filter((s) => channelStatus(`en:${s}`) !== "down");

// Healthy Anichin sources first, unknown next; ReelShort is served by its own scrape in mixes.
// Sources that paywall ep 6+ sink below the fully-free ones so home/feed grids lead with full catalogs.
function anichinPicks(n) {
  const rank = { up: 0, unknown: 1, down: 2 };
  const key = (id) => (LIMITED.has(id) ? 1 : 0) * 10 + rank[channelStatus(`anichin:${id}`)];
  return SOURCES.map((s) => s.id)
    .filter((id) => id !== "reelshort" && !KD_SOURCES.has(id) && anichinUsable(id))
    .sort((a, b) => key(a) - key(b))
    .slice(0, n);
}

async function anList(source, type, page = 1, attempts) {
  const { items, hasMore } = await anichin.list(source, type, page, attempts);
  return { items: remember(dedupe(items.map((it) => fromAnichin(source, it)))), hasMore };
}

async function anSearch(source, query, attempts) {
  const { items } = await anichin.search(source, query, 1, attempts);
  return remember(dedupe(items.map((it) => fromAnichin(source, it))));
}

async function rsShelfBooks(pattern) {
  const { shelves } = await rs.hall();
  const shelf = shelves.find((s) => pattern.test(s.name));
  if (!shelf) return [];
  const books = await rs.shelf(shelf.id, shelf.name).catch(() => shelf.books);
  return remember(dedupe(books.map(fromReelshort)));
}

async function rsPool() {
  const [{ shelves }, ranking, fresh] = await Promise.all([
    rs.hall(),
    rsShelfBooks(/ranking/i).catch(() => []),
    rsShelfBooks(/rilis/i).catch(() => []),
  ]);
  const shelfBooks = remember(shelves.flatMap((s) => s.books).map(fromReelshort));
  return dedupe(interleave([shelfBooks, ranking, fresh]));
}

const paginate = (items, page, size = PAGE_SIZE) => ({
  items: items.slice((page - 1) * size, page * size),
  page,
  hasMore: items.length > page * size,
});

const cleanShelfName = (name) => name.replace(/[^\p{L}\p{N}\s&',.-]/gu, "").replace(/\s+/g, " ").trim();

// English home: built only from the kd adapters' English catalogs (first section = trending, second = latest,
// third = for you), one "Populer di" row per source with 6+ items. Keys stay unique.
async function enHome() {
  const picks = enHealthy();
  const soon = (promise) => within(promise, BUDGET_MS);
  const [trending, latest, foryou] = await Promise.all(
    ["trending", "latest", "foryou"].map((type) => Promise.all(picks.map((s) => soon(kd.pool(s, type, "en"))))),
  );
  const lists = (results) => results.map((r) => r || []).filter((l) => l.length);
  const trendLists = lists(trending);
  const sections = [];
  const add = (key, title, style, items, max) => {
    const unique = dedupe(items).slice(0, max);
    if (unique.length) sections.push({ key, title, style, items: unique });
  };
  add("hero", "Sorotan", "hero", interleave(trendLists), 8);
  add("top10", "Top 10 Hari Ini", "rank", interleave(trendLists.map((l) => l.slice(0, 3))), 10);
  add("trending", "Sedang Trending", "row", interleave(trendLists.map((l) => l.slice(1))), 20);
  add("latest", "Rilis Terbaru", "row", interleave(lists(latest)), 20);
  add("foryou", "Pilihan Untukmu", "row", interleave(lists(foryou)), 20);
  let rows = 0;
  picks.forEach((source, i) => {
    const items = trending[i] || [];
    if (rows < HOME_EN_ROWS && items.length >= 6) {
      rows++;
      add(`${source}:trending`, `Populer di ${sourceName(source)}`, "row", items, 20);
    }
  });
  add("explore", "Jelajahi Semua", "grid", interleave([...lists(foryou), ...trendLists.map((l) => l.slice(20))]), 40);
  if (!sections.length) throw new HttpError(503, "Semua sumber sedang tidak tersedia");
  return { sections };
}

export async function home(lang = "id") {
  if (lang === "en") return enHome();
  const picks = anichinPicks(5);
  const kdPicks = kdHealthy();
  const soon = (promise) => within(promise, BUDGET_MS);
  const [hallData, ranking, fresh, trending, latest, foryou, nartoRows, kdRows] = await Promise.all([
    soon(rs.hall()),
    soon(rsShelfBooks(/ranking/i)),
    soon(rsShelfBooks(/rilis/i)),
    Promise.all(picks.map((s) => soon(anList(s, "trending")))),
    Promise.all(picks.slice(0, 3).map((s) => soon(anList(s, "latest")))),
    Promise.all(picks.slice(0, 2).map((s) => soon(anList(s, "foryou")))),
    Promise.all([...NARTO_SOURCES].map((s) => soon(narto.list(s).then((r) => r.items)))),
    Promise.all(kdPicks.map((s) => soon(kd.pool(s, "trending")))),
  ]);

  const shelves = hallData?.shelves || [];
  const shelfItems = (pattern) => remember((shelves.find((s) => pattern.test(s.name))?.books || []).map(fromReelshort));
  const rankItems = ranking?.length ? ranking : shelfItems(/ranking/i);
  const freshItems = fresh?.length ? fresh : shelfItems(/rilis/i);
  const recommended = shelfItems(/direkomendasikan|rekomendasi/i);
  const lists = (results) => results.filter(Boolean).map((r) => r.items);
  const trendLists = lists(trending);
  const latestLists = lists(latest);
  const foryouLists = lists(foryou);

  const sections = [];
  const add = (key, title, style, items, max) => {
    const unique = dedupe(items).slice(0, max);
    if (unique.length) sections.push({ key, title, style, items: unique });
  };

  const banners = remember((hallData?.banners || []).map(fromBanner));
  add("hero", "Sorotan", "hero", [...banners, ...rankItems.slice(0, 8), ...interleave(trendLists)], 8);
  add("top10", "Top 10 Hari Ini", "rank", rankItems.length ? rankItems : interleave(trendLists), 10);
  add("trending", "Sedang Trending", "row", interleave([...trendLists, rankItems.slice(10, 40)]), 20);
  add("latest", "Rilis Terbaru", "row", interleave([freshItems, ...latestLists]), 20);
  add("foryou", "Pilihan Untukmu", "row", interleave([...foryouLists, recommended, rankItems.slice(40, 80)]), 20);

  const everything = interleave([shelfItems(/cinta/i), ...trendLists, ...latestLists, ...foryouLists, rankItems, freshItems]);
  add("romance", "Romansa & CEO", "row", everything.filter((d) => ROMANCE.test(`${d.title} ${d.tags.join(" ")}`)), 20);

  let perSource = 0;
  picks.forEach((source, i) => {
    const items = trending[i]?.items || [];
    if (perSource < 3 && items.length >= 6) {
      perSource++;
      add(`${source}:trending`, `Populer di ${sourceName(source)}`, "row", items, 20);
    }
  });

  shelves
    .filter((s) => !/ranking|rilis|rekomendasi/i.test(s.name))
    .slice(0, 4)
    .forEach((s) => add(`reelshort:shelf:${s.id}`, cleanShelfName(s.name), "row", s.books.map(fromReelshort), 20));

  [...NARTO_SOURCES].forEach((source, i) => {
    const items = nartoRows?.[i] || [];
    if (items.length >= 4) add(`${source}:trending`, `Populer di ${sourceName(source)}`, "row", items, 20);
  });

  let kdRowCount = 0;
  kdPicks.forEach((source, i) => {
    const items = kdRows[i] || [];
    if (kdRowCount < HOME_KD_ROWS && items.length >= 6) {
      kdRowCount++;
      add(`${source}:trending`, `Populer di ${sourceName(source)}`, "row", items, 20);
    }
  });

  add(
    "explore",
    "Jelajahi Semua",
    "grid",
    interleave([recommended, ...foryouLists, ...trendLists.map((l) => l.slice(20)), rankItems.slice(80)]),
    40,
  );

  if (!sections.length) throw new HttpError(503, "Semua sumber sedang tidak tersedia");
  return { sections: sections.map((s) => ({ ...s, items: stampAll(s.items) })) };
}

async function enFeed(page) {
  const picks = enHealthy().slice(0, FEED_EN);
  const pools = await Promise.all(picks.map((s) => within(kd.pool(s, "foryou", "en"), BUDGET_MS)));
  const slices = pools.map((p) => (p || []).slice((page - 1) * FEED_PER_SOURCE, page * FEED_PER_SOURCE));
  if (page === 1 && pools.every((p) => !p)) throw new HttpError(503, "Semua sumber sedang tidak tersedia");
  return {
    items: dedupe(interleave(slices)),
    page,
    hasMore: pools.some((p) => (p?.length || 0) > page * FEED_PER_SOURCE),
  };
}

export async function feed(page, lang = "id") {
  if (lang === "en") return enFeed(page);
  const picks = anichinPicks(4);
  const kdPicks = kdHealthy().slice(0, FEED_KD);
  const [results, previous, pool, kdPools] = await Promise.all([
    Promise.all(picks.map((s) => within(anList(s, "foryou", page), BUDGET_MS))),
    page > 1 ? Promise.all(picks.map((s) => within(anList(s, "foryou", page - 1), BUDGET_MS))) : [],
    within(rsPool(), BUDGET_MS),
    Promise.all(kdPicks.map((s) => within(kd.pool(s, "foryou"), BUDGET_MS))),
  ]);
  const lists = results.map((r, i) => {
    if (!r) return [];
    // Some sources ignore `page` (or stop paging) and repeat the previous page; drop those.
    if (page > 1 && r.items[0] && previous[i]?.items[0]?.id === r.items[0].id) return [];
    return r.items.slice(0, FEED_PER_SOURCE);
  });
  const rsShare = picks.length ? FEED_PER_SOURCE : PAGE_SIZE;
  const rsItems = (pool || []).slice((page - 1) * rsShare, page * rsShare);
  const kdLists = kdPools.map((p) => (p || []).slice((page - 1) * FEED_PER_SOURCE, page * FEED_PER_SOURCE));
  const items = dedupe(interleave([rsItems, ...lists, ...kdLists]));
  if (!items.length && page === 1 && !pool && results.every((r) => !r) && kdPools.every((p) => !p)) {
    throw new HttpError(503, "Semua sumber sedang tidak tersedia");
  }
  const hasMore =
    results.some((r, i) => r?.hasMore && lists[i].length) ||
    (pool?.length || 0) > page * rsShare ||
    kdPools.some((p) => (p?.length || 0) > page * FEED_PER_SOURCE);
  return { items: stampAll(items), page, hasMore };
}

async function reelshortWebList(type, page) {
  const items = type === "trending" ? await rsShelfBooks(/ranking/i) : type === "latest" ? await rsShelfBooks(/rilis/i) : await rsPool();
  return paginate(items, page);
}

export async function list(source, type, page, lang = "id") {
  assertSource(source);
  if (!LIST_TYPES.has(type)) throw new HttpError(400, "Parameter type harus trending, latest, atau foryou");
  // A source without an English catalog does not exist in English mode: an empty page, not an error.
  if (lang === "en") return hasLang(source, "en") ? kd.list(source, type, page, "en") : { items: [], page, hasMore: false };
  const result = await idList(source, type, page);
  return { ...result, items: stampAll(result.items) };
}

async function idList(source, type, page) {
  if (KD_SOURCES.has(source)) return kd.list(source, type, page);
  if (NARTO_SOURCES.has(source)) {
    const items = await narto.list(source).then((r) => r.items).catch(() => []);
    if (items.length || NARTO_ONLY.has(source)) return { items, page, hasMore: false };
  } else if (source === "reelshort") {
    if (anichinUsable(source)) {
      const result = await within(anList(source, type, page, 2), FALLBACK_WAIT_MS);
      if (result?.items.length) return { items: result.items, page, hasMore: result.hasMore };
    }
    return reelshortWebList(type, page);
  }
  const { items, hasMore } = await anList(source, type, page);
  return { items, page, hasMore };
}

async function reelshortSearch(query, pages = 1) {
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => rs.search(query, i + 1).catch(() => null)));
  if (!results[0]) throw new HttpError(502, "Pencarian ReelShort gagal");
  return remember(dedupe(results.flatMap((r) => r?.books || []).map(fromReelshort)));
}

export async function search(query, source, lang = "id") {
  const q = String(query || "").trim();
  if (!q) throw new HttpError(400, "Parameter q wajib diisi");
  if (q.length > 100) throw new HttpError(400, "Kata kunci terlalu panjang");
  if (source) assertSource(source);
  if (lang === "en") {
    if (source) return hasLang(source, "en") ? kd.search(source, q, "en") : { items: [] };
    const results = await Promise.all(
      enHealthy()
        .slice(0, SEARCH_EN)
        .map((s) => within(kd.search(s, q, "en").then((r) => r.items), BUDGET_MS)),
    );
    if (results.every((r) => r === undefined)) throw new HttpError(503, "Pencarian sedang tidak tersedia");
    return { items: dedupe(interleave(results.filter(Boolean))) };
  }
  const { items } = await idSearch(q, source);
  return { items: stampAll(items) };
}

async function idSearch(q, source) {
  if (source) {
    if (KD_SOURCES.has(source)) return kd.search(source, q);
    if (NARTO_SOURCES.has(source)) {
      const items = await narto.search(source, q).then((r) => r.items).catch(() => []);
      if (items.length || NARTO_ONLY.has(source)) return { items };
    } else if (source === "reelshort") {
      if (anichinUsable(source)) {
        const items = await within(anSearch(source, q, 2), FALLBACK_WAIT_MS);
        if (items?.length) return { items };
      }
      return { items: await reelshortSearch(q) };
    }
    return { items: await anSearch(source, q) };
  }
  const picks = anichinPicks(5);
  const results = await Promise.all([
    within(reelshortSearch(q, 2), BUDGET_MS),
    ...picks.map((s) => within(anSearch(s, q), BUDGET_MS)),
    ...[...NARTO_SOURCES].map((s) => within(narto.search(s, q).then((r) => r.items), BUDGET_MS)),
    ...kdHealthy()
      .slice(0, SEARCH_KD)
      .map((s) => within(kd.search(s, q).then((r) => r.items), BUDGET_MS)),
  ]);
  if (results.every((r) => r === undefined)) throw new HttpError(503, "Pencarian sedang tidak tersedia");
  return { items: dedupe(interleave(results.filter(Boolean))) };
}

async function countBySearch(source, id, title) {
  if (!title) return 0;
  const items = await anSearch(source, title).catch(() => []);
  return items.find((d) => d.id === id)?.totalEpisodes || 0;
}

async function anichinDetail(source, id, attempts) {
  const raw = await anichin.detail(source, id, attempts);
  const drama = mergeDrama(fromAnichin(source, { ...raw, id }), known.get(`${source}:${id}`));
  if (Array.isArray(raw.episodes) && raw.episodes.length) {
    const episodes = anichinEpisodes(raw.episodes);
    return { ...drama, totalEpisodes: episodes.length, episodes };
  }
  const total = drama.totalEpisodes || (await countBySearch(source, id, drama.title));
  return { ...drama, totalEpisodes: total, episodes: episodeRefs(total) };
}

// Anichin flags ReelShort's paid episodes as locked, but the website fallback serves every episode.
const unlocked = (d) => ({ ...d, episodes: d.episodes.map((e) => ({ ...e, locked: false })) });

export async function detail(source, id) {
  assertSource(source);
  const { raw, content } = parseId(source, id);
  const result = content === "en" ? await kd.detail(source, raw, "en") : stamp(await idDetail(source, raw));
  return { ...result, id };
}

async function idDetail(source, id) {
  if (KD_SOURCES.has(source)) return kd.detail(source, id);
  if (NARTO_SOURCES.has(source)) {
    const d = await narto.detail(source, id).catch(() => null);
    if (d?.episodes?.length || NARTO_ONLY.has(source)) {
      if (!d) throw new HttpError(502, `narto ${source}: detail gagal`);
      return { ...d, episodes: d.episodes.map((e) => ({ number: e.number, title: e.title, locked: false })) };
    }
  } else if (source === "reelshort") {
    if (anichinUsable(source)) {
      const result = await within(anichinDetail(source, id, 2), FALLBACK_WAIT_MS);
      if (result?.episodes.length) return unlocked(result);
    }
    return mergeDrama(reelshortDetail(await rs.movie(id)), known.get(`reelshort:${id}`));
  }
  const unlockFlags = (d) =>
    UNLOCKABLE.has(source) ? { ...d, episodes: d.episodes.map((e) => ({ ...e, locked: false })) } : d;
  const pending = anichinDetail(source, id);
  const seen = known.get(`${source}:${id}`);
  if (!seen?.totalEpisodes) return unlockFlags(await pending);
  // A drama seen in a list can be served from that record while Anichin retries in the background.
  return unlockFlags((await within(pending, BUDGET_MS)) || { ...seen, episodes: episodeRefs(seen.totalEpisodes) });
}

async function sniffType(url) {
  const res = await fetch(url, {
    headers: { ...headersFor(url), Range: "bytes=0-511" },
    signal: AbortSignal.timeout(6000),
  });
  const type = res.headers.get("content-type") || "";
  const reader = res.body.getReader();
  const { value } = await reader.read();
  await reader.cancel().catch(() => {});
  const head = Buffer.from(value || []).toString("utf8", 0, 32);
  return /mpegurl/i.test(type) || head.includes("#EXTM3U") || head.trimStart().startsWith("{") ? "hls" : "mp4";
}

async function mediaType(url) {
  const { origin, pathname } = new URL(url);
  if (/\.m3u8$/i.test(pathname) || /\/hls$/i.test(pathname)) return "hls";
  if (/\.mp4$/i.test(pathname)) return "mp4";
  return cache.wrap(`sniff:${origin}${pathname}`, 60 * 60e3, () => sniffType(url)).catch(() => "mp4");
}

function unlockPlay(source, id, number, resolved, base) {
  const codec = codecOf(resolved.url);
  return {
    source,
    id,
    number,
    locked: false,
    url: proxify(base, resolved.url),
    type: resolved.type,
    ...(codec ? { codec } : {}),
    qualities: (resolved.qualities || []).map((q) => ({ label: String(q.label || "Auto"), url: proxify(base, q.url) })),
    subtitles: [],
  };
}

// A stream resolved from the official DramaWave/FreeReels backend keeps the original source/id.
function dwPlay(source, id, number, resolved, base, wanted) {
  return {
    source,
    id,
    number,
    locked: false,
    url: proxify(base, resolved.url),
    type: resolved.type,
    qualities: [],
    subtitles: subtitleList(resolved.subtitles, wanted, base),
  };
}

async function anichinPlay(source, id, number, raw, base, wanted) {
  const qualityList = (raw.qualityList || [])
    .filter((q) => q?.url)
    .map((q) => ({ ...q, url: anichin.absolute(q.url), codec: codecOf(q.codec, q.url) }));
  const fallback = qualityList.find((q) => q.isDefault) || qualityList[0];
  const upstreamMain = anichin.absolute(raw.videoUrl || fallback?.url);
  const play = { source, id, number: Number(raw.number ?? raw.episodeNumber) || number, locked: Boolean(raw.locked) };
  if (!upstreamMain) {
    if (play.locked) return { ...play, url: "", type: "mp4", qualities: [], subtitles: [] };
    throw new HttpError(502, "Video episode tidak tersedia dari upstream");
  }
  // Chromium cannot decode HEVC: when upstream's default is HEVC and an H.264 option exists, play that one.
  const current = qualityList.find((q) => q.url === upstreamMain);
  const alt =
    current?.codec === "hevc" &&
    (qualityList.find((q) => q.codec === "h264" && q.label === current.label) || qualityList.find((q) => q.codec === "h264"));
  const main = alt?.url || upstreamMain;
  const codec = alt ? alt.codec : current?.codec;
  return {
    ...play,
    locked: false, // a playable url means the episode is not locked, whatever the upstream flag says
    url: proxify(base, main),
    type: await mediaType(main),
    ...(codec ? { codec } : {}),
    qualities: preferH264(qualityList).map((q) => ({ label: String(q.label || "Auto"), url: proxify(base, q.url) })),
    subtitles: subtitleList(
      (raw.subtitles || []).filter((s) => s?.url).map((s) => ({ ...s, url: anichin.absolute(s.url) })),
      wanted,
      base,
    ),
  };
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const titleKey = (t) =>
  clean(t)
    .toLowerCase()
    .replace(/\((dubbed|dub|sub|indo)\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// First SWAP_ORDER source whose search yields a matching title wins; scoring prefers an exact
// normalized key, then the episode-rich cut of that title (ties broken by popularity).
async function findSwap(title, key, exclude) {
  for (const target of SWAP_ORDER) {
    if (target === exclude) continue;
    const items = await anichin
      .search(target, title, 1)
      .then((r) => r.items || [])
      .catch(() => []);
    const best = items
      .map((it) => fromAnichin(target, it))
      .map((d) => {
        const k = titleKey(d.title);
        const score = !k ? 0 : k === key ? 2 : k.includes(key) || key.includes(k) ? 1 : 0;
        return { d, score };
      })
      .filter((r) => r.score >= 1 && r.d.id)
      .sort((a, b) => b.score - a.score || b.d.totalEpisodes - a.d.totalEpisodes || b.d.viewCount - a.d.viewCount)[0];
    if (best) return { source: target, id: best.d.id };
  }
  return null;
}

// A limited-source episode we cannot play is served from the same title on a free source, while the
// EpisodePlay keeps the ORIGINAL source/id so app routes and history keys stay valid; only url swaps.
async function swapEpisode(source, id, number, base, wanted) {
  let title = known.get(`${source}:${id}`)?.title;
  if (!title) {
    try {
      title = (await anichin.detail(source, id))?.title || "";
    } catch {
      return null;
    }
  }
  const key = titleKey(title);
  if (!key) return null;
  const target = await cache.wrap(`swap:${source}:${id}`, 10 * 60e3, () => findSwap(title, key, source), { swr: true }).catch(() => null);
  if (!target) return null;
  try {
    const result = await idEpisode(target.source, target.id, number, base, wanted);
    if (result?.url) return { ...result, source, id };
  } catch {}
  return null;
}

// `lang` (the query) is the requested language: it only orders subtitles; the catalog comes from the id suffix.
export async function episode(source, id, ep, base, lang = "id") {
  assertSource(source);
  const { raw, content } = parseId(source, id);
  const number = Number(ep);
  if (!Number.isInteger(number) || number < 1) throw new HttpError(400, "Parameter ep harus bilangan bulat >= 1");
  const result =
    content === "en" ? await kd.episode(source, raw, number, base, "en", lang) : await idEpisode(source, raw, number, base, lang);
  return { ...result, id };
}

async function idEpisode(source, id, number, base, wanted) {
  if (KD_SOURCES.has(source)) return kd.episode(source, id, number, base, "id", wanted);
  if (NARTO_SOURCES.has(source)) {
    const play = await narto.episode(source, id, number).catch(() => null);
    if (play?.url) {
      return {
        ...play,
        url: proxify(base, play.url),
        qualities: play.qualities.map((q) => ({ label: q.label, url: proxify(base, q.url) })),
      };
    }
    if (NARTO_ONLY.has(source)) throw new HttpError(502, `narto ${source}: tidak ada stream`);
  } else if (source === "reelshort") {
    if (anichinUsable(source)) {
      const raw = await within(anichin.episode(source, id, number, 2), FALLBACK_WAIT_MS);
      if (raw?.videoUrl) return anichinPlay(source, id, number, raw, base, wanted);
    }
    const web = await rs.episode(id, number);
    // A master playlist may list HEVC variants; if it also has an H.264 one, play that variant directly.
    const h264 = web.qualities.find((q) => q.codec === "h264");
    const hevc = web.qualities.some((q) => q.codec === "hevc");
    const only = (c) => web.qualities.length > 0 && web.qualities.every((q) => q.codec === c);
    const codec = h264 && hevc ? "h264" : only("hevc") ? "hevc" : only("h264") ? "h264" : undefined;
    return {
      source,
      id,
      number,
      locked: false,
      url: proxify(base, hevc && h264 ? h264.url : web.url),
      type: "hls",
      ...(codec ? { codec } : {}),
      qualities: preferH264(web.qualities).map((q) => ({ label: q.label, url: proxify(base, q.url) })),
      subtitles: subtitleList(web.subtitles, wanted, base),
    };
  }
  const raw = await anichin.episode(source, id, number);
  // Upstream hides paid episodes (locked + empty videoUrl); some providers still serve
  // them through the aggregator's /hls resolver (see unlock.mjs).
  if (!raw?.videoUrl && UNLOCKABLE.has(source)) {
    const resolved = await resolveLocked(source, id, number);
    if (resolved) return unlockPlay(source, id, number, resolved, base);
  }
  // dramawave/freereels paywall ep 6+ upstream, but the official backend serves the same episode
  // (its per-series free window). Resolve it directly before falling back to a cross-source swap.
  if (!raw?.videoUrl && SELF_HOST.has(source)) {
    const resolved = await dw.episode(id, number);
    if (resolved?.url) return dwPlay(source, id, number, resolved, base, wanted);
  }
  const play = await anichinPlay(source, id, number, raw, base, wanted);
  // Limited sources have no unlock path: when upstream serves no url, mirror the title on a free source.
  if (!play.url && SWAP_FALLBACK.has(source)) {
    const swapped = await swapEpisode(source, id, number, base, wanted);
    if (swapped) return swapped;
  }
  return play;
}

// The English catalogs load only after the Indonesian batch settles, so they never delay it.
export async function warmUp() {
  await Promise.all([
    rs.hall().catch(() => {}),
    ...SOURCES.filter((s) => !KD_SOURCES.has(s.id)).map((s) => anichin.list(s.id, "trending", 1).catch(() => {})),
    ...[...NARTO_SOURCES].map((s) => narto.list(s).catch(() => {})),
    ...KD_ORDER.map((s) => kd.list(s, "trending", 1).catch(() => {})),
  ]);
  await Promise.all(EN_ORDER.map((s) => kd.list(s, "trending", 1, "en").catch(() => {})));
}
