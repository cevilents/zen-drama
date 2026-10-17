// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/goodshort.js with the English upstream values from its php/sources/goodshort.php.
import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'goodshort';
// Bahasa = segmen path. Hanya channel -1 (Tren) terlokalisasi (563/567 selalu katalog Indonesia), jadi katalog Inggris
// memakai channel -1 halaman 1 dan 2. Detail/episode/stream tanpa lang (terikat bookId). CDN HLS tanpa CORS: proxy.
const LANG = 'en';
const CHANNELS = [
  [-1, 'Tren', false, 1],
  [-1, 'Tren', false, 2],
];

// Upstream kadang membalas 52x (Cloudflare); coba ulang beberapa kali.
async function call(path, opts) {
  let err;
  for (let i = 0; i < 2; i++) {
    try {
      return await upstream(SOURCE, path, opts);
    } catch (e) {
      err = e;
      if (e.status === 404 || e.status === 504) break; // timeout tidak diulang supaya tidak melewati batas klien
    }
  }
  throw err instanceof UpstreamError ? err : new UpstreamError(`${SOURCE}: gagal`);
}

const card = (b) => ({
  id: String(b.bookId),
  title: b.bookName,
  cover: b.cover || '',
  episodes: b.chapterCount || undefined,
  tags: b.labels || [],
});

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => i.id && i.title && !seen.has(i.id) && seen.add(i.id));
}

// Satu channel berisi banyak kolom; kolom tanpa nama (feed 1 item) digabung ke judul channel.
function channelSections(channelTitle, records, force) {
  const byTitle = new Map();
  for (const r of records || []) {
    if (/^SLIDE_BANNER/.test(r.style)) continue;
    const title = (force ? channelTitle : r.name || channelTitle).replace(/\p{Extended_Pictographic}/gu, '').trim() || channelTitle;
    byTitle.set(title, [...(byTitle.get(title) || []), ...(r.items || []).filter((i) => i.bookId).map(card)]);
  }
  return [...byTitle].map(([title, items]) => ({ title, items: dedupe(items) }));
}

export default {
  id: SOURCE,
  name: 'GoodShort',
  async home() {
    const calls = await Promise.allSettled(
      CHANNELS.map(([cid, , , page]) => call(`/get-home/${LANG}/${cid}`, page > 1 ? { query: { page } } : {})),
    );
    const sections = calls.flatMap((c, i) =>
      c.status === 'fulfilled' ? channelSections(CHANNELS[i][1], c.value.data?.records, CHANNELS[i][2]) : [],
    );
    // Gabungkan section bernama sama dari channel berbeda
    const merged = new Map();
    for (const s of sections) {
      const cur = merged.get(s.title);
      if (cur) cur.items = dedupe([...cur.items, ...s.items]);
      else merged.set(s.title, s);
    }
    return { sections: [...merged.values()].filter((s) => s.items.length) };
  },
  async search(q) {
    const d = await call(`/search/${LANG}/${encodeURIComponent(q)}`);
    return { items: dedupe((d.data?.searchResult?.records || []).map(card)) };
  },
  async detail(id) {
    const [d, e] = await Promise.all([
      call(`/get-detail/${encodeURIComponent(id)}`),
      call(`/get-episodes/${encodeURIComponent(id)}`),
    ]);
    const b = d.data.book;
    const episodes = (e.episodes || []).map((x) => ({
      key: String(x.episode),
      number: x.episode,
      locked: x.price > 0,
    }));
    return {
      id: String(b.bookId),
      title: b.bookName,
      cover: b.bookDetailCover || b.cover || '',
      description: b.introduction || '',
      tags: b.labels || [],
      totalEpisodes: b.chapterCount || episodes.length,
      episodes,
    };
  },
  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    const s = d.streams?.[d.default] || Object.values(d.streams || {})[0];
    if (!s?.master) throw new UpstreamError(`${SOURCE}: stream tidak tersedia`, 404);
    // CDN tidak mengirim Access-Control-Allow-Origin
    return { url: s.master, type: 'hls', proxy: true };
  },
};
