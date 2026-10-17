// Bridge to the hand-tuned per-provider adapters in ./kd/sources (ported from the NANDA DRACIN project; see
// ./kd/lib/upstream.js for the shim they import). Each adapter exposes home/search/detail/stream in its own
// shape; this module maps them to the app contract (Drama, DramaDetail, EpisodePlay), caches them, proxies
// subtitles and the media urls a browser cannot load itself (see playUrl) and records health on the `kd:<id>`
// channel (`en:<id>` for the English catalog).
// Every call takes a content language ("id" | "en"): adapters read it through withLang/langValue, cache keys
// include it, and English items get the `~en` id suffix (docs/LANG_CONTRACT.md).
import { cache } from "./cache.mjs";
import { HttpError, setReferer } from "./http.mjs";
import { subtitleList, withSuffix } from "./lang.mjs";
import { dedupe, interleave } from "./normalize.mjs";
import { proxify } from "./proxy.mjs";
import { itemLang, recordHealth } from "./sources.mjs";
import { inLane, withLang } from "./kd/lib/upstream.js";
import anyreel from "./kd/sources/anyreel.js";
import bibishort from "./kd/sources/bibishort.js";
import candyjar from "./kd/sources/candyjar.js";
import cubetv from "./kd/sources/cubetv.js";
import flextv from "./kd/sources/flextv.js";
import joyreels from "./kd/sources/joyreels.js";
import kalostv from "./kd/sources/kalostv.js";
import microdrama from "./kd/sources/microdrama.js";
import moboreels from "./kd/sources/moboreels.js";
import mydrama from "./kd/sources/mydrama.js";
import myrelle from "./kd/sources/myrelle.js";
import playlet from "./kd/sources/playlet.js";
import reelala from "./kd/sources/reelala.js";
import reelbuzz from "./kd/sources/reelbuzz.js";
import reelife from "./kd/sources/reelife.js";
import sarostv from "./kd/sources/sarostv.js";
import shortical from "./kd/sources/shortical.js";
import starshort from "./kd/sources/starshort.js";
import velolo from "./kd/sources/velolo.js";
import vigloo from "./kd/sources/vigloo.js";
// English catalogs of sources the Indonesian mode serves through Anichin/Narto/ReelShort-web (catalog.mjs).
import dramaboxEn from "./kd/sources/en/dramabox.js";
import dramawaveEn from "./kd/sources/en/dramawave.js";
import flickreelsEn from "./kd/sources/en/flickreels.js";
import freereelsEn from "./kd/sources/en/freereels.js";
import goodshortEn from "./kd/sources/en/goodshort.js";
import happyshortEn from "./kd/sources/en/happyshort.js";
import idramaEn from "./kd/sources/en/idrama.js";
import netshortEn from "./kd/sources/en/netshort.js";
import reelshortEn from "./kd/sources/en/reelshort.js";
import shortmaxEn from "./kd/sources/en/shortmax.js";
import vyntageEn from "./kd/sources/en/vyntage.js";

const ADAPTERS = new Map(
  [
    anyreel, bibishort, candyjar, cubetv, flextv, joyreels, kalostv, microdrama, moboreels, mydrama,
    myrelle, playlet, reelala, reelbuzz, reelife, sarostv, shortical, starshort, velolo, vigloo,
  ].map((a) => [a.id, a]),
);
const EN_ADAPTERS = new Map(
  [
    dramaboxEn, dramawaveEn, flickreelsEn, freereelsEn, goodshortEn, happyshortEn, idramaEn, netshortEn,
    reelshortEn, shortmaxEn, vyntageEn,
  ].map((a) => [a.id, a]),
);

const TTL = { home: 5 * 60e3, search: 5 * 60e3, detail: 10 * 60e3, episode: 75e3 };
// A stale episode entry (signed CDN url) is served after a failed refresh only while it is this young.
const EPISODE_STALE_LIMIT_MS = 10 * 60e3;
const PAGE_SIZE = 20;
// Under the app's 30 s request timeout; a slower call keeps running in the background and fills the cache.
const USER_WAIT_MS = 25000;
// Upstream `number`s within this many of the episode count are treated as positions (sortable).
const POSITION_SLACK = 5;
const ID_PATTERN = /^[\w-]{1,64}$/;
// Providers whose upstream `locked` flag is not a paywall. flextv: 91 of 100 flagged episodes return
// distinct full-length MP4s from /get-stream. starshort and velolo: the adapters document every episode as
// open, and no lock flag showed up on 12 sampled titles (2026-10-15).
const FLAGS_IGNORED = new Set(["flextv", "starshort", "velolo"]);
// PROXY_ALL=1|true|yes sends every stream through /api/proxy again (all video bandwidth goes through this server).
export const PROXY_ALL = /^(1|true|yes)$/i.test(process.env.PROXY_ALL ?? "");
// Channels whose adapter says `proxy: false` but that must not be played directly. Every other `proxy: false`
// channel passed a direct browser check on 2026-10-15 (Origin: http://localhost:8082 and a random https origin, with
// Referer: http://localhost:8082/; redirects followed by hand, every hop https + ACAO; playlist, first variant, https
// URIs only, first segment, EXT-X-KEY/EXT-X-MAP, MP4 Range; segments re-checked after an Origin-less request).
const FORCE_PROXY = new Set([
  // static.vyntagetv.com (CloudFront + S3): playlists send ACAO, but CloudFront caches segments without
  // Origin in the cache key, so a segment first fetched without Origin is served to browsers with no ACAO.
  "en:vyntage",
  // realpricf.farsunpteltd.com (reelala): sends ACAO but answers 403 as soon as a request carries a browser Referer
  // (any page origin); only Origin-only or bare requests get 200.
  "kd:reelala",
  "en:reelala",
  // Not registered in sources.mjs (upstream down on 2026-10-15), so its CDN has never been checked.
  "kd:kalostv",
  "en:kalostv",
]);

/** Served by an adapter in the Indonesian catalog (the English catalog of every en source goes through here). */
export const has = (source) => ADAPTERS.has(source);

function adapter(source, lang) {
  const a = (lang === "en" && EN_ADAPTERS.get(source)) || ADAPTERS.get(source);
  if (!a) throw new HttpError(400, `Source tidak dikenal: ${source}`);
  return a;
}

const channelOf = (source, lang) => `${lang === "en" ? "en" : "kd"}:${source}`;

// The upstream url itself when the adapter marks it browser-playable (`proxy: false`: the CDN sends
// Access-Control-Allow-Origin and needs no Referer) over https (no mixed content on the https tunnel);
// otherwise a signed /api/proxy url.
function playUrl(base, source, lang, stream) {
  const direct =
    !PROXY_ALL && stream.proxy === false && !stream.referer && !FORCE_PROXY.has(channelOf(source, lang)) && /^https:\/\//i.test(stream.url);
  return direct ? stream.url : proxify(base, stream.url);
}

// Health on `kd:<id>`: any success marks the source up. A failure counts only when the provider itself is
// unreachable (network error, timeout, gateway 5xx: `transport` from the shim) or, with `strict` (the home
// load behind every list), when it yields nothing usable. A bad id, an empty detail, a missing stream or an
// adapter TypeError on one title never marks the whole source down.
async function tracked(source, lang, fn, { strict = false } = {}) {
  try {
    const value = await withLang(lang, fn);
    recordHealth(channelOf(source, lang), true);
    return value;
  } catch (err) {
    if (strict || err?.transport) recordHealth(channelOf(source, lang), false, err?.message || String(err));
    throw err;
  }
}

function inTime(promise, source) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new HttpError(504, `${source}: upstream lambat`), { upstream: true })),
      USER_WAIT_MS,
    );
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const tagList = (tags) => [...new Set((Array.isArray(tags) ? tags : []).map(clean).filter(Boolean))].slice(0, 8);

// Ids that would fail the catalog's id check (and break app routes) are dropped here (checked before the suffix).
const toDrama = (source, card, lang) => ({
  id: withSuffix(String(card?.id ?? ""), lang),
  source,
  title: clean(card?.title),
  cover: card?.cover || "",
  description: clean(card?.description),
  tags: tagList(card?.tags),
  totalEpisodes: Number(card?.episodes ?? card?.totalEpisodes) || 0,
  viewCount: 0,
  isCompleted: false,
  lang: itemLang(source, lang),
});
const toDramas = (source, cards, lang) =>
  dedupe((cards || []).filter((c) => ID_PATTERN.test(String(c?.id ?? ""))).map((c) => toDrama(source, c, lang)));

// Served stale while refreshing; warmUp reloads it every 10 minutes, so viewers rarely wait on a cold load.
function sectionsOf(source, lang) {
  return cache.wrap(
    `kd:home:${lang}:${source}`,
    TTL.home,
    () =>
      tracked(
        source,
        lang,
        () =>
          // Lanes are per language so a slow English load never queues ahead of an Indonesian one.
          inLane(`home:${lang}`, async () => {
            const { sections } = await adapter(source, lang).home();
            const out = (sections || []).map((s) => toDramas(source, s.items, lang)).filter((items) => items.length);
            if (!out.length) throw new HttpError(502, `${source}: beranda kosong`);
            return out;
          }),
        { strict: true },
      ),
    { swr: true },
  );
}

// trending = first upstream section, latest = second, foryou = third; a missing section falls back to the
// whole catalog (all sections interleaved and de-duplicated). Pages are slices of PAGE_SIZE.
export async function pool(source, type = "trending", lang = "id") {
  const sections = await sectionsOf(source, lang);
  const index = type === "latest" ? 1 : type === "foryou" ? 2 : 0;
  return sections[index] || (type === "latest" ? sections[0] : dedupe(interleave(sections)));
}

export async function list(source, type, page = 1, lang = "id") {
  const items = await inTime(pool(source, type, lang), source);
  return { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, hasMore: items.length > page * PAGE_SIZE };
}

export async function search(source, query, lang = "id") {
  return cache.wrap(
    `kd:search:${lang}:${source}:${query.toLowerCase()}`,
    TTL.search,
    () =>
      tracked(source, lang, () =>
        inLane(`search:${lang}`, async () => {
          // Several providers answer 404 when nothing matches.
          const result = await adapter(source, lang).search(query).catch((err) => {
            if (err?.status === 404) return { items: [] };
            throw err;
          });
          return { items: toDramas(source, result?.items, lang) };
        }),
      ),
    { swr: true },
  );
}

// Sort by `number` only when the numbers look like positions (unique integers 0..count+slack); some
// providers put chapter ids there, and then the adapter's own order is the episode order.
function inOrder(list) {
  const nums = list.map((e) => Number(e.number));
  const positional =
    nums.every(Number.isInteger) &&
    new Set(nums).size === nums.length &&
    Math.min(...nums) >= 0 &&
    Math.max(...nums) <= nums.length + POSITION_SLACK;
  return positional ? [...list].sort((a, b) => Number(a.number) - Number(b.number)) : list;
}

// Episodes are renumbered 1..N in that order so the contract holds; `keys[n - 1]` is what the adapter's
// stream() needs for episode n. A title the provider cannot list episodes for is a 404, not a source failure.
async function rawDetail(source, id, lang) {
  return cache.wrap(
    `kd:detail:${lang}:${source}:${id}`,
    TTL.detail,
    () =>
      tracked(source, lang, async () => {
        let d;
        try {
          d = await adapter(source, lang).detail(id);
        } catch (err) {
          if (err?.transport) throw err;
          throw new HttpError(404, `${source}: detail kosong`);
        }
        const list = (d?.episodes || []).filter((e) => e && e.key != null && e.key !== "");
        if (!list.length) throw new HttpError(404, `${source}: detail kosong`);
        const ordered = inOrder(list);
        const sequential = ordered.every((e, i) => Number(e.number) === i + 1);
        const episodes = ordered.map((e, i) => ({
          number: i + 1,
          title: sequential ? clean(e.title) || `Episode ${i + 1}` : `Episode ${i + 1}`,
          locked: Boolean(e.locked) && !FLAGS_IGNORED.has(source),
        }));
        const drama = toDrama(source, { ...d, id: String(id), episodes: d.totalEpisodes }, lang);
        // An adapter that fell back to another catalog (velolo: en 404 -> id) reports it: the item keeps its `~en` id
        // (so it still resolves) but is labelled with the language actually shown.
        if (d.lang === "id" || d.lang === "en") drama.lang = d.lang;
        return {
          drama: { ...drama, totalEpisodes: episodes.length, episodes },
          keys: ordered.map((e) => String(e.key)),
        };
      }),
    { swr: true },
  );
}

export async function detail(source, id, lang = "id") {
  return (await inTime(rawDetail(source, id, lang), source)).drama;
}

// `lang` = content language of the id (catalog), `wanted` = requested language (subtitle order only).
export async function episode(source, id, number, base, lang = "id", wanted = lang) {
  const { keys } = await inTime(rawDetail(source, id, lang), source);
  const key = keys[number - 1];
  if (key == null) throw new HttpError(404, `Episode ${number} tidak ditemukan`);
  const playId = withSuffix(String(id), lang);
  let stream;
  try {
    stream = await inTime(
      cache.wrap(
        `kd:episode:${lang}:${source}:${id}:${number}:${key}`,
        TTL.episode,
        () =>
          tracked(source, lang, async () => {
            const s = await adapter(source, lang).stream(id, key);
            if (!s?.url) throw new HttpError(404, `${source}: tidak ada stream`);
            return s;
          }),
        { staleLimitMs: EPISODE_STALE_LIMIT_MS },
      ),
      source,
    );
  } catch (err) {
    // A timeout stays a 504; a refusal, paywall, missing url or adapter error is an unplayable episode,
    // reported the way the contract describes (locked + empty url) instead of a 5xx the app reads as offline.
    if (err?.status === 504) throw err;
    return { source, id: playId, number, locked: true, url: "", type: "hls", qualities: [], subtitles: [] };
  }
  const subtitles = (stream.subtitles || []).filter((s) => s?.url);
  if (stream.referer) {
    for (const u of [stream.url, ...subtitles.map((s) => s.url)]) {
      try {
        setReferer(u, stream.referer);
      } catch {
        // an unparsable url simply gets no Referer
      }
    }
  }
  return {
    source,
    id: playId,
    number,
    locked: false,
    url: playUrl(base, source, lang, stream),
    type: stream.type === "mp4" ? "mp4" : "hls",
    qualities: [],
    subtitles: subtitleList(subtitles.map((s) => ({ label: s.label, language: s.lang, url: s.url })), wanted, base),
  };
}
