const MAX_TAGS = 8;
// ReelShort tag_list categories that are not genres: 1000 = audience, 1001 = cast.
const NON_GENRE_CATEGORIES = new Set(["1000", "1001"]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const isTrue = (value) => value === true || value === 1 || ["1", "true", "yes"].includes(String(value).toLowerCase());

function count(...candidates) {
  for (const value of candidates) {
    const n = Array.isArray(value) ? value.length : Number(value);
    if (n > 0) return Math.floor(n);
  }
  return 0;
}

function toTags(value) {
  let list = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      list = value.split(",");
    }
  }
  if (!Array.isArray(list)) return [];
  const names = list
    .filter((t) => !NON_GENRE_CATEGORIES.has(String(t?.category_id)))
    .map((t) => clean(typeof t === "string" ? t : t?.tag_name || t?.text || t?.name || t?.tagName))
    .filter(Boolean);
  return [...new Set(names)].slice(0, MAX_TAGS);
}

export function fromAnichin(source, item) {
  return {
    id: String(item.id ?? item.dramaId ?? ""),
    source,
    title: clean(item.title),
    cover: item.cover || item.posterImg || "",
    description: clean(item.description || item.synopsis),
    tags: toTags(item.categoryNames),
    totalEpisodes: count(item.episodes, item.totalEpisodes),
    viewCount: Number(item.viewCount) || 0,
    isCompleted: isTrue(item.isCompleted),
  };
}

export function fromReelshort(book) {
  return {
    id: String(book.book_id ?? book._id ?? ""),
    source: "reelshort",
    title: clean(book.book_title),
    cover: book.book_pic || book.default_pic || "",
    description: clean(book.special_desc),
    tags: toTags(book.theme_list?.length ? book.theme_list : book.tag_list?.length ? book.tag_list : book.theme || book.tag),
    totalEpisodes: count(book.chapter_count),
    viewCount: Number(book.read_count) || 0,
    isCompleted: book.update_status == null ? true : Number(book.update_status) === 1,
  };
}

// Chromium cannot decode HEVC, so streams are classified as "h264" / "hevc" (undefined when unknown).
// Upstream codec strings (bytevc1, hvc1, avc1.64001f) win; otherwise only the file name hints at it (".h264.mp4").
const HEVC_HINT = /hevc|h\.?265|hvc1|hev1|bytevc1/i;
const AVC_HINT = /h\.?264|avc/i;
const HEVC_FILE = /(?:^|[._-])(?:hevc|h\.?265|hvc1)(?:[._-]|$)/i;
const AVC_FILE = /(?:^|[._-])(?:h\.?264|avc1?)(?:[._-]|$)/i;

export function codecOf(codec, url = "") {
  if (codec) return HEVC_HINT.test(codec) ? "hevc" : AVC_HINT.test(codec) ? "h264" : undefined;
  let file = "";
  try {
    file = new URL(url, "http://x").pathname.split("/").pop();
  } catch {}
  return HEVC_FILE.test(file) ? "hevc" : AVC_FILE.test(file) ? "h264" : undefined;
}

// H.264 first, unknown in between, HEVC last; the sort is stable so upstream order is otherwise kept.
const codecRank = (codec) => (codec === "h264" ? 0 : codec === "hevc" ? 2 : 1);
export const preferH264 = (qualities) => [...qualities].sort((a, b) => codecRank(a.codec) - codecRank(b.codec));

export const fromBanner = (banner) => ({ ...fromReelshort(banner.jump_param), banner: banner.pic });

export const episodeRefs = (total) =>
  Array.from({ length: total }, (_, i) => ({ number: i + 1, title: `Episode ${i + 1}`, locked: false }));

export function reelshortDetail(data) {
  const chapters = (data.online_base || [])
    .filter((c) => Number(c.serial_number) >= 1)
    .sort((a, b) => a.serial_number - b.serial_number);
  const drama = fromReelshort(data);
  return {
    ...drama,
    totalEpisodes: chapters.length || drama.totalEpisodes,
    episodes: chapters.length
      ? chapters.map((c) => ({
          number: Number(c.serial_number),
          title: `Episode ${c.serial_number}`,
          locked: false,
          ...(c.video_pic ? { thumb: c.video_pic } : {}),
        }))
      : episodeRefs(drama.totalEpisodes),
  };
}

// Number 0 is a trailer on some sources (ReelShort); playable episodes start at 1.
export function anichinEpisodes(episodes) {
  const byNumber = new Map();
  episodes.forEach((e, i) => {
    const raw = Number(e.number ?? e.episodeNumber);
    const number = Number.isFinite(raw) ? raw : i + 1;
    if (number >= 1 && !byNumber.has(number)) byNumber.set(number, { number, title: `Episode ${number}`, locked: Boolean(e.locked) });
  });
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

// Fill gaps in `primary` (empty tags, unknown counts) from another record of the same drama.
export function mergeDrama(primary, extra) {
  if (!extra) return primary;
  return {
    ...primary,
    title: primary.title || extra.title,
    cover: primary.cover || extra.cover,
    description: primary.description || extra.description,
    tags: primary.tags.length ? primary.tags : extra.tags,
    totalEpisodes: primary.totalEpisodes || extra.totalEpisodes,
    viewCount: primary.viewCount || extra.viewCount,
  };
}

export const dramaKey = (d) => `${d.source}:${d.id}`;

export function dedupe(items) {
  const seen = new Set();
  return items.filter((d) => {
    if (!d?.id || !d.title) return false;
    const key = dramaKey(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function interleave(lists) {
  const out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const list of lists) if (i < list.length) out.push(list[i]);
  return out;
}
