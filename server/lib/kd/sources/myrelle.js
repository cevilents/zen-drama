// Myrelle (Narto Drama, backend quickeltv). Konten hanya tersedia dalam bahasa Inggris
// (/get-languages tidak punya Indonesia; ?lang= tidak mengubah judul), jadi LANG = 'en'.
// Episode terkunci (is_lock) tetap mengembalikan video_url HLS yang bisa diputar.
// HLS di CloudFront S3: playlist dan segmen sama-sama ber-CORS.

import { upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'myrelle';
const PREFIX = '/api';
const LANG = 'en';

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: LANG, ...opts.query } });

const clean = (s) => String(s ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

const tagsOf = (p) =>
  (p.categoryList?.map((c) => c.name) || p.category || []).map(clean).filter(Boolean).slice(0, 4);

const card = (p) => ({
  id: String(p.short_play_id ?? p.id),
  title: clean(p.name),
  cover: p.image_url || p.horizontally_img,
  episodes: Number(p.episode_total) || undefined,
  tags: tagsOf(p),
});

const uniq = (items) => {
  const seen = new Set();
  return items.filter((d) => d.id && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

// Modul /get-home: data bisa berupa { list } atau array langsung.
const moduleList = (m) => (Array.isArray(m?.data) ? m.data : m?.data?.list) || [];
const MODULES = [
  ['home_v3_recommand', 'Sorotan'],
  ['new_recommand', 'Drama Baru'],
  ['week_ranking', 'Peringkat Mingguan'],
];

export default {
  id: SOURCE,
  name: 'Myrelle',

  async home() {
    const [home, trending, fresh] = await Promise.allSettled([
      call('/get-home'),
      call('/get-ranking', { query: { type: 'most_trending' } }),
      call('/get-ranking', { query: { type: 'new_releases' } }),
    ]);
    const sections = [];
    if (trending.status === 'fulfilled') sections.push({ title: 'Sedang Tren', items: uniq((trending.value.list || []).map(card)) });
    if (home.status === 'fulfilled') {
      for (const [key, title] of MODULES) {
        const m = (home.value.modules || []).find((x) => x.module_key === key);
        if (m) sections.push({ title, items: uniq(moduleList(m).map(card)) });
      }
    }
    if (fresh.status === 'fulfilled') sections.push({ title: 'Rilis Terbaru', items: uniq((fresh.value.list || []).map(card)) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || trending.reason || new UpstreamError('myrelle: beranda kosong', 502);
    return { sections: out };
  },

  async search(q) {
    const d = await call('/search', { query: { keyword: q } });
    return { items: uniq((d.list || []).map(card)) };
  },

  async detail(id) {
    const d = await call(`/get-detail/${encodeURIComponent(id)}`);
    const p = d.shortPlayInfo || {};
    const episodes = (d.episodeList || []).map((e) => ({
      key: String(e.episode),
      number: e.episode,
      title: `Episode ${e.episode}`,
    }));
    return {
      id: String(id),
      title: clean(p.name),
      cover: p.image_url || p.horizontally_img || '',
      description: String(p.description ?? '').replace(/\s*\n\s*/g, '\n').replace(/^"|"$/g, '').trim(),
      tags: tagsOf(p),
      totalEpisodes: Number(p.episode_total) || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    if (!d.video_url) throw new UpstreamError('myrelle: URL stream tidak ditemukan', 502);
    return { url: d.video_url, type: 'hls', proxy: false };
  },
};
