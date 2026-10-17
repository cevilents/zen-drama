import { cache } from "./cache.mjs";
import { HttpError, createLimiter, request } from "./http.mjs";
import { codecOf } from "./normalize.mjs";
import { recordHealth } from "./sources.mjs";

const SITE = "https://www.reelshort.com";
const LOCALE = "id";
const BUILD_TTL = 30 * 60e3;
const TTL = { list: 5 * 60e3, detail: 10 * 60e3, episode: 90e3 };
const SUBTITLE_LANGS = {
  in: { label: "Indonesia", language: "id" },
  en: { label: "Inggris", language: "en" },
};

const limit = createLimiter(4);
let build = { id: "", at: 0 };
let homeLoad = null;

export const slugify = (title) =>
  String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "-");

async function tracked(promise) {
  try {
    const value = await promise;
    recordHealth("web:reelshort", true);
    return value;
  } catch (err) {
    if (err.status !== 404) recordHealth("web:reelshort", false, err.message);
    throw err;
  }
}

// The localized homepage carries both the Next.js buildId and the hall data (banners + shelves).
function loadHome() {
  homeLoad ??= tracked(
    (async () => {
      const html = await request(`${SITE}/${LOCALE}`, { as: "text", attempts: 2, timeoutMs: 10000, limit });
      const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) throw new HttpError(502, "reelshort: __NEXT_DATA__ not found", true);
      const data = JSON.parse(match[1]);
      build = { id: data.buildId, at: Date.now() };
      const info = data.props?.pageProps?.fallback?.["/api/ms/hall/webInfo"] || {};
      return {
        banners: (info.banners || []).filter((b) => b.jump_param?.book_id),
        shelves: (info.bookShelfList || [])
          .filter((s) => Array.isArray(s.books) && s.books.length)
          .map((s) => ({ id: String(s.bs_id), name: s.bookshelf_name || "", books: s.books })),
      };
    })(),
  ).finally(() => {
    homeLoad = null;
  });
  return homeLoad;
}

export const hall = () => cache.wrap("rs:hall", TTL.list, loadHome, { swr: true });

async function buildId() {
  if (build.id && Date.now() - build.at < BUILD_TTL) return build.id;
  cache.set("rs:hall", await loadHome(), TTL.list);
  return build.id;
}

async function nextData(path, query, hops = 0) {
  const id = await buildId();
  const url = `${SITE}/_next/data/${id}/${LOCALE}/${path}.json?${new URLSearchParams(query)}`;
  let body;
  try {
    body = await tracked(request(url, { attempts: 2, timeoutMs: 10000, limit }));
  } catch (err) {
    // A 404 on every route means a new deploy changed the buildId.
    if (err.status === 404 && hops === 0 && Date.now() - build.at > 60e3) {
      build.at = 0;
      return nextData(path, query, 1);
    }
    throw err;
  }
  const props = body.pageProps || {};
  if (props.__N_REDIRECT) {
    // Wrong or missing slugs redirect to the canonical one, so a bare bookId is enough.
    const target = new URL(props.__N_REDIRECT, SITE);
    const nextPath = target.pathname.replace(new RegExp(`^/${LOCALE}/?`), "");
    if (hops >= 3 || !nextPath) throw new HttpError(404, "Tidak ditemukan di ReelShort");
    const nextQuery = Object.fromEntries(target.searchParams);
    if (nextPath.includes("/")) nextQuery.slug = nextPath.split("/").slice(1).join("/");
    return nextData(nextPath, nextQuery, hops + 1);
  }
  return props;
}

export function shelf(id, name) {
  return cache.wrap(
    `rs:shelf:${id}`,
    TTL.list,
    async () => {
      const slug = `${slugify(name) || "shelf"}-short-movies-dramas-${id}`;
      const props = await nextData(`shelf/${slug}`, { slug });
      return props.list || [];
    },
    { swr: true },
  );
}

export function search(keywords, page = 1) {
  return cache.wrap(
    `rs:search:${keywords.toLowerCase()}:${page}`,
    TTL.list,
    async () => {
      const props = await nextData("search", page > 1 ? { keywords, page } : { keywords });
      return { books: props.books || [], hasMore: Number(props.page || page) < Number(props.totalPage || 0) };
    },
    { swr: true },
  );
}

export function movie(bookId) {
  return cache.wrap(
    `rs:movie:${bookId}`,
    TTL.detail,
    async () => {
      const props = await nextData(`movie/${bookId}`, { slug: bookId });
      if (!props.data?.book_id) throw new HttpError(404, "Drama tidak ditemukan di ReelShort");
      return props.data;
    },
    { swr: true },
  );
}

async function readMaster(url) {
  const text = await request(url, { as: "text", attempts: 2 });
  const lines = text.split(/\r?\n/);
  const qualities = [];
  const subtitlePlaylists = [];
  lines.forEach((line, i) => {
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const uri = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith("#"));
      const res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
      if (uri) {
        const label = res ? `${Math.min(Number(res[1]), Number(res[2]))}p` : `Varian ${qualities.length + 1}`;
        qualities.push({ label, url: new URL(uri.trim(), url).href, codec: codecOf(/CODECS="([^"]+)"/.exec(line)?.[1]) });
      }
    } else if (line.startsWith("#EXT-X-MEDIA") && line.includes("TYPE=SUBTITLES")) {
      const lang = /LANGUAGE="([^"]+)"/.exec(line)?.[1];
      const uri = /URI="([^"]+)"/.exec(line)?.[1];
      if (uri && SUBTITLE_LANGS[lang]) subtitlePlaylists.push({ ...SUBTITLE_LANGS[lang], playlist: new URL(uri, url).href });
    }
  });
  const subtitles = await Promise.all(
    subtitlePlaylists.map(async ({ playlist, ...meta }) => {
      try {
        const body = await request(playlist, { as: "text", attempts: 1, timeoutMs: 5000 });
        const file = body.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#"));
        return file ? { ...meta, url: new URL(file.trim(), playlist).href } : null;
      } catch {
        return null;
      }
    }),
  );
  return { qualities, subtitles: subtitles.filter(Boolean) };
}

export function episode(bookId, number) {
  return cache.wrap(`rs:episode:${bookId}:${number}`, TTL.episode, async () => {
    const data = await movie(bookId);
    const chapter = (data.online_base || []).find((c) => Number(c.serial_number) === number);
    if (!chapter) throw new HttpError(404, "Episode tidak ditemukan");
    const slug = `episode-${number}-${slugify(data.book_title)}-${bookId}-${chapter.chapter_id}`;
    const props = await nextData(`episodes/${slug}`, { play_time: 1, slug });
    const url = props.data?.video_url;
    if (!url) throw new HttpError(502, "ReelShort tidak mengembalikan video_url");
    const extras = await readMaster(url).catch(() => ({ qualities: [], subtitles: [] }));
    return { url, ...extras };
  });
}
