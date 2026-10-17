// Adapter Reelife (narto-drama, prefix /api). Bahasa konten: Indonesia ('id').
// Stream: MP4 langsung di CDN S3 tanpa header CORS (proxy). Semua episode sudah terbuka (locked=false).
// Nama episode dari upstream berbahasa Mandarin, jadi dibuat ulang sebagai "Episode N".

import { upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'reelife';
const PREFIX = '/api';
const LANG = 'id';

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: LANG, ...opts.query } });

const clean = (s) => String(s ?? '').trim();

const card = (b) => ({
  id: String(b.bookId),
  title: clean(b.bookName),
  cover: b.coverWap,
  episodes: Number(b.lastChapterId) || undefined,
  tags: (b.bookTags || []).map(clean).filter(Boolean).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((b) => b.bookId && b.bookName && b.coverWap && !seen.has(b.bookId) && seen.add(b.bookId))
    .map(card);
};

export default {
  id: SOURCE,
  name: 'Reelife',

  async home() {
    const [home, ranks, cat] = await Promise.allSettled([
      call('/get-home'),
      call('/get-ranks'),
      call('/get-category/93'), // CEO
    ]);
    const sections = [];
    if (home.status === 'fulfilled') {
      for (const c of home.value.data?.columnList || []) sections.push({ title: clean(c.title) || 'Pilihan', items: cards(c.bookVos) });
    }
    if (ranks.status === 'fulfilled') {
      for (const r of ranks.value.data?.rankList || []) sections.push({ title: clean(r.rankTitle) || 'Peringkat', items: cards(r.bookList) });
    }
    if (cat.status === 'fulfilled') sections.push({ title: 'CEO', items: cards(cat.value.data?.bookList) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || ranks.reason || new UpstreamError('reelife: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    const d = await call('/search', { query: { q } });
    return { items: cards(d.data?.bookList) };
  },

  async detail(id) {
    const d = (await call(`/get-episodes/${encodeURIComponent(id)}`)).data;
    const b = d?.bookVo;
    if (!b) throw new UpstreamError('reelife: drama tidak ditemukan', 404);
    const episodes = (d.chapterList || []).map((c) => ({
      key: String(c.chapterId),
      number: Number(c.chapterId),
      title: `Episode ${c.chapterId}`,
    }));
    return {
      id: String(b.bookId),
      title: clean(b.bookName),
      cover: b.coverWap,
      description: clean(b.introduction),
      tags: (b.bookTags || []).map(clean).filter(Boolean),
      totalEpisodes: episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    // Pilih kualitas tertinggi yang ada, kalau tidak ada pakai video_url bawaan.
    const best = [...(d.qualities || [])].filter((x) => x.video_url).sort((a, b) => b.quality - a.quality)[0];
    const url = best?.video_url || d.video_url;
    if (!url) throw new UpstreamError('reelife: URL stream tidak ditemukan');
    return { url, type: 'mp4', proxy: true };
  },
};
