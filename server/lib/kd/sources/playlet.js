// Playlet (Narto Drama). Katalog per bahasa lewat ?lang= (kode huruf besar: ID, EN). Judul/sinopsis melekat pada
// theater_id; detail mengikuti lang (tag), stream tidak (lang tetap 'ID' supaya cache dipakai bersama).
// Episode di atas jatah gratis (is_lock/svip) tetap terbuka lewat /get-stream (locked:false).
// HLS di CDN dengan CORS terbuka (playlist & segmen); sebagian drama punya subtitle WebVTT.

import { langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'playlet';
const PREFIX = '/api';
const LANGS = { id: 'ID', en: 'EN' };

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });

const clean = (s) => String(s ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

const card = (p) => ({
  id: String(p.theater_id),
  title: clean(p.title),
  cover: p.cover,
  episodes: Number(p.total_episodes) || undefined,
  tags: (p.tags || []).map(clean).filter(Boolean).slice(0, 4),
});

const uniq = (items) => {
  const seen = new Set();
  return items.filter((d) => d.id !== 'undefined' && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

const CODE_TITLES = { trends: 'Sedang Tren' };

export default {
  id: SOURCE,
  name: 'Playlet',

  async home() {
    const [home, foryou] = await Promise.allSettled([call('/get-home'), call('/get-foryou')]);
    const sections = [];
    if (foryou.status === 'fulfilled') sections.push({ title: 'Pilihan Untukmu', items: uniq((foryou.value.data || []).map(card)) });
    if (home.status === 'fulfilled') {
      for (const col of home.value.data || []) {
        const title = clean(col.title) || CODE_TITLES[col.code] || 'Pilihan';
        sections.push({ title, items: uniq((col.items || []).map(card)) });
      }
    }
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || foryou.reason || new UpstreamError('playlet: beranda kosong', 502);
    return { sections: out };
  },

  async search(q) {
    const d = await call('/search', { query: { keyword: q } });
    return { items: uniq((d.items || []).map(card)) };
  },

  async detail(id) {
    const { data: d } = await call(`/get-detail/${encodeURIComponent(id)}`);
    const episodes = (d.chapters || []).map((c, i) => {
      const number = Number(c.chapter_id) || i + 1;
      return { key: String(c.chapter_id), number, title: `Episode ${number}` };
    });
    return {
      id: String(id),
      title: clean(d.title),
      cover: d.cover,
      description: clean(d.intro),
      tags: (d.tags || []).map(clean).filter(Boolean),
      totalEpisodes: d.total_episodes || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const { data: d } = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, {
      query: { lang: LANGS.id },
      ttl: 60,
    });
    if (!d?.video_url) throw new UpstreamError('playlet: URL stream tidak ditemukan', 502);
    const subtitles = (d.subtitles || [])
      .filter((s) => s.url && s.lang)
      .map((s) => ({ lang: String(s.lang).toLowerCase(), label: s.title || s.lang, url: s.url }));
    return { url: d.video_url, type: 'hls', proxy: false, ...(subtitles.length && { subtitles }) };
  },
};
