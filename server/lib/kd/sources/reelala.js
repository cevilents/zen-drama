// Reelala (Narto Drama, vendor zhangwan). Katalog terpisah per bahasa lewat ?lang= (id, en; playlet_id berbeda per
// katalog). Beranda/pencarian ikut lang; detail/stream mengikuti katalog id-nya, jadi tetap lang=id (cache bersama).
// Judul asli Mandarin ada di contract_title; yang dipakai `title` (sudah Indonesia).
// Episode terbuka semua lewat /get-stream. HLS CDN dengan CORS terbuka (playlist & segmen).

import { langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'reelala';
const PREFIX = '/api';
const LANGS = { id: 'id', en: 'en' };

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });
const fixed = { lang: LANGS.id };

const clean = (s) => String(s ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

const tagNames = (p) =>
  (p.playlet_tag_name || p.tag_list?.map((t) => t.tag_name) || []).map(clean).filter(Boolean).slice(0, 4);

const card = (p) => ({
  id: String(p.playlet_id),
  title: clean(p.title || p.playlet_title),
  cover: p.cover,
  episodes: Number(p.upload_num ?? p.chapter_num) || undefined,
  tags: tagNames(p),
});

const uniq = (items) => {
  const seen = new Set();
  return items.filter((d) => d.id !== 'undefined' && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

const stripEmoji = (s) => clean(String(s ?? '').replace(/[\p{Extended_Pictographic}️]/gu, ''));

export default {
  id: SOURCE,
  name: 'Reelala',

  async home() {
    const [home, foryou] = await Promise.allSettled([call('/get-home'), call('/get-foryou')]);
    const sections = [];
    if (home.status === 'fulfilled') {
      for (const col of home.value.data?.columns || []) {
        if (col.style === '5') continue; // karusel banner, isinya duplikat "Paling Populer"
        sections.push({ title: stripEmoji(col.title) || 'Pilihan', items: uniq((col.list || []).map(card)) });
      }
    }
    if (foryou.status === 'fulfilled') sections.push({ title: 'Pilihan Untukmu', items: uniq((foryou.value.data?.list || []).map(card)) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || foryou.reason || new UpstreamError('reelala: beranda kosong', 502);
    return { sections: out };
  },

  async search(q) {
    const d = await call('/search', { query: { keyword: q } });
    return { items: uniq((d.data || []).map(card)) };
  },

  async detail(id) {
    const { data: d } = await call(`/get-detail/${encodeURIComponent(id)}`, { query: fixed });
    const episodes = (d.list || []).map((c, i) => {
      const number = Number(c.chapter_num) || i + 1;
      return { key: String(c.chapter_id), number, title: `Episode ${number}` };
    });
    return {
      id: String(id),
      title: clean(d.title),
      cover: d.cover,
      description: clean(d.introduce),
      tags: tagNames(d),
      totalEpisodes: Number(d.upload_num) || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { query: fixed, ttl: 60 });
    if (!d.video_url) throw new UpstreamError('reelala: URL stream tidak ditemukan', 502);
    return { url: d.video_url, type: 'hls', proxy: false };
  },
};
