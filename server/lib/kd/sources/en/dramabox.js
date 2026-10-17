// English catalog only (served by kd.mjs for lang=en; lang=id keeps the Anichin/Narto/web route in catalog.mjs).
// Ported from NANDA DRACIN sources/dramabox.js with the English upstream values from its php/sources/dramabox.php.
// Adapter DramaBox (narto-drama, prefix /api). Katalog Inggris (?lang=en); detail/stream terikat bookId.
// Subtitle: subtitles[] per episode (.srt, buku sumber Inggris hingga ~15 bahasa; buku sulih suara tanpa subtitle).
// Stream: MP4 asli di CDN DramaBox terenkripsi; /get-all-streams-proxy mengembalikan URL
// narto (dramabox-stream.narto-drama.com) yang mendekripsi per-range, ber-CORS, mendukung Range.
// Episode berbayar (isCharge=1) tetap dapat URL yang bisa diputar.
// Tidak ada daftar episode di /get-detail, jadi daftar diambil dari /get-all-streams-proxy.

import { upstream, UpstreamError } from '../../lib/upstream.js';

const SOURCE = 'dramabox';
const PREFIX = '/api';
const q = { lang: 'en' };

const call = (path, opts = {}) => upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { ...q, ...opts.query } });

const HAN = /[㐀-鿿]/;
const clean = (s) => String(s ?? '').replace(/[​-‍﻿]/g, '').trim();

const card = (b) => ({
  id: String(b.bookId),
  title: clean(b.bookName),
  cover: b.coverWap || b.cover || '',
  episodes: b.chapterCount || undefined,
  tags: (b.tags || b.tagNames || []).map(clean).filter(Boolean).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((b) => b?.bookId && b.bookName)
    .map(card)
    .filter((d) => d.cover && !seen.has(d.id) && seen.add(d.id));
};

// Judul kolom beraksara Mandarin (mis. "算法6宫格-印尼语") diganti label generik.
const colTitle = (t, fallback) => (t && !HAN.test(t) ? clean(t) : fallback);

const allStreams = (id, ttl) => call(`/get-all-streams-proxy/${encodeURIComponent(id)}`, { ttl });

export default {
  id: SOURCE,
  name: 'DramaBox',

  async home() {
    const [home, latest, rank] = await Promise.allSettled([call('/get-home'), call('/get-latest'), call('/get-rank')]);
    const sections = [];
    if (home.status === 'fulfilled') {
      const h = home.value;
      (h.columnVoList || []).forEach((c, i) =>
        sections.push({ title: colTitle(c.title, i === 0 ? 'Pilihan Untukmu' : 'Rekomendasi'), items: cards(c.bookList) }),
      );
      sections.push({
        title: 'Rekomendasi Populer',
        items: cards(h.recommendList?.records), // kartu bertipe tag (tagCardVo) tidak punya bookId, otomatis terbuang
      });
    }
    if (latest.status === 'fulfilled') sections.push({ title: 'Baru Rilis', items: cards(latest.value.newTheaterList?.records) });
    if (rank.status === 'fulfilled') sections.push({ title: 'Sedang Tren', items: cards(rank.value.rankList) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || latest.reason || rank.reason || new UpstreamError('dramabox: beranda kosong');
    return { sections: out };
  },

  async search(query) {
    const d = await call(`/search/${encodeURIComponent(query)}`);
    return { items: cards(d.suggestList) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), allStreams(id)]);
    if (info.eighteenTip) throw new UpstreamError('dramabox: konten dewasa (18+) tidak ditampilkan', 404);
    const episodes = (eps.episodes || []).map((e) => ({
      key: String(e.chapterId),
      number: e.chapterIndex + 1,
      title: `Episode ${e.chapterIndex + 1}`,
    }));
    return {
      id: String(info.bookId),
      title: clean(info.bookName),
      cover: info.bookCover || info.cover || '',
      description: clean(info.introduction),
      tags: (info.tags || []).map(clean).filter(Boolean),
      totalEpisodes: info.totalEpisodes || info.chapterCount || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await allStreams(id, 60);
    const e = (d.episodes || []).find((x) => String(x.chapterId) === String(key));
    const p = e?.playUrls;
    const url = p?.['720'] || p?.['540'] || p?.['1080'] || (p && Object.values(p)[0]);
    if (!url) throw new UpstreamError('dramabox: URL stream tidak ditemukan', 404);
    // 'zh' DramaBox = Mandarin Tradisional, 'in' = Indonesia (dinormalkan di kd.mjs).
    const subtitles = (e.subtitles || []).filter((x) => x?.lang && x.url).map((x) => ({ lang: x.lang, url: x.url }));
    return { url, type: 'mp4', proxy: false, subtitles };
  },
};
