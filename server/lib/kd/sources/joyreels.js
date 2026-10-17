// Adapter JoyReels (narto-drama, prefix /api). Katalog per bahasa lewat ?lang= (id, en); id channel berbeda per
// bahasa (Indonesia tetap, Inggris diambil dari /get-channels); judul/sinopsis melekat pada id drama.
// Stream: HLS AES-128 di video.joyreels.com; playlist & segmen ber-CORS, kunci diambil
// browser dari api.joyreels.com (CORS memantulkan Origin), jadi tanpa proxy.
// Episode berbayar (source "vip") tetap terbuka lewat /get-stream.
// Upstream sering 522/502 sesaat dan lambat; tiap panggilan dicoba sekali lagi.

import { contentLang, langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'joyreels';
const PREFIX = '/api';
const LANGS = { id: 'id', en: 'en' };
const CHANNELS = [['43', 'Asia'], ['71', 'Baru'], ['72', 'Peringkat']]; // id channel dari /get-channels (lang=id)
// Cadangan Inggris bila /get-channels gagal: ASIAN, NEW, RANKING dari /get-channels?lang=en (2026-10-15).
const CHANNELS_EN = [['28', 'Asia'], ['10', 'Baru'], ['46', 'Peringkat']];

const call = async (path, opts = {}) => {
  const run = () => upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });
  try {
    return await run();
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) throw e;
    return run();
  }
};

const card = (p) => ({
  id: String(p.id),
  title: String(p.title ?? '').trim(),
  cover: p.vertical_poster_url || '',
  episodes: p.episode_count || undefined,
  tags: (p.tags?.length ? p.tags.map((t) => t.name) : [p.category_text]).filter(Boolean).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list ?? []).map(card).filter((d) => d.id && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

const label = (t, fallback) => String(t ?? '').replace(/[\p{Extended_Pictographic}️]/gu, '').trim() || fallback;

// Bahasa selain Indonesia: /get-channels (urutan upstream: Hot, Baru, Peringkat, Film, Asia, ...) lalu Asia (terakhir),
// Baru (kedua) dan Peringkat (judul "rank..." atau posisi ketiga), seperti versi PHP NANDA.
async function channels() {
  if (contentLang() === 'id') return CHANNELS;
  const d = await call('/get-channels', { ttl: 21600 }).catch(() => null);
  const list = (d?.channels ?? []).filter((c) => /^\d+$/.test(String(c?.id ?? '')));
  if (!list.length) return CHANNELS_EN;
  if (list.length < 3) return list.map((c) => [String(c.id), label(c.title, 'Pilihan')]);
  const rank = list.find((c) => /rank|peringkat/i.test(String(c.title ?? ''))) || list[2];
  const out = new Map();
  for (const c of [list[list.length - 1], list[1], rank]) out.set(String(c.id), [String(c.id), label(c.title, 'Pilihan')]);
  return [...out.values()];
}

export default {
  id: SOURCE,
  name: 'JoyReels',

  async home() {
    const list = await channels();
    const done = await Promise.allSettled(list.map(([c]) => call(`/get-channel/${c}`)));
    const sections = [];
    done.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const items = cards(r.value.modules?.flatMap((m) => m.playlets ?? []));
      sections.push({ title: label(r.value.modules?.[0]?.title, list[i][1]), items });
    });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw done.find((r) => r.status === 'rejected')?.reason || new UpstreamError('joyreels: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    const d = await call(`/search/${encodeURIComponent(q)}`);
    return { items: cards(d.items) };
  },

  async detail(id) {
    const [info, cat] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), call(`/get-catalog/${encodeURIComponent(id)}`)]);
    const episodes = (cat.items ?? []).map((e) => ({ key: String(e.episode_id), number: e.idx, title: `Episode ${e.idx}` }));
    return {
      id: String(info.playletId ?? id),
      title: String(info.title ?? '').trim(),
      cover: info.large_vertical_poster_url || info.vertical_poster_url || '',
      description: String(info.summary ?? '').trim(),
      tags: [info.category_text, ...(info.tags ?? []).map((t) => t.name)].filter(Boolean),
      totalEpisodes: info.episode_count || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    if (!d.url) throw new UpstreamError('joyreels: URL stream tidak ditemukan');
    const subtitles = (d.subtitles ?? [])
      .filter((s) => s.url)
      .map((s) => ({ lang: s.language, label: s.language_text || s.language, url: s.url }));
    return { url: d.url, type: 'hls', proxy: false, ...(subtitles.length && { subtitles }) };
  },
};
