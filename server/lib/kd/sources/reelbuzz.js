// ReelBuzz (Narto Drama). Konten selalu Indonesia (?lang= diabaikan upstream).
// Wajib prefix /api (tanpa itu jatuh ke edge lain "invalid token").
// Stream: tidak ada /get-stream; /get-all-streams mengembalikan mp4 terenkripsi Aliyun yang
// TIDAK bisa diputar. Yang dipakai /get-all-streams-proxy: URL reelbuzz-stream.narto-drama.com
// men-dekripsi sambil jalan (mp4 biasa, Range + CORS terbuka, berlaku ~1 jam, episode berbayar ikut terbuka).
// Satu panggilan berisi semua episode (~150KB), jadi di-cache 60 detik dan dipakai ulang antar episode.

import { upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'reelbuzz';
const PREFIX = '/api';
const RANKINGS = [
  [4, 'Tren Populer'],
  [5, 'Terbaru'],
];
const QUALITY = ['720P', '540P', '1080P'];

const call = (path, opts = {}) => upstream(SOURCE, path, { prefix: PREFIX, ...opts });

const clean = (s) => String(s ?? '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

const tagNames = (list) => (list || []).map((t) => clean(t.tagName ?? t)).filter(Boolean).slice(0, 4);

const card = (d) => ({
  id: String(d.id ?? d.dramaId),
  title: clean(d.name ?? d.dramaName),
  cover: d.coverUrl,
  episodes: Number(d.episodes) || undefined,
  tags: tagNames(d.tagList || d.dramaTags),
});

const uniq = (items) => {
  const seen = new Set();
  return items.filter((d) => d.id !== 'undefined' && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'ReelBuzz',

  async home() {
    const [tabs, ...ranks] = await Promise.allSettled([
      call('/get-tabs'),
      ...RANKINGS.map(([rid]) => call(`/get-ranking/${rid}`)),
    ]);
    const sections = [];
    if (tabs.status === 'fulfilled') {
      // tagType 1 = daftar drama biasa; tagType 3 = "Segera Hadir" (trailer, belum bisa diputar).
      for (const t of tabs.value.rows || []) {
        if (t.tagType !== 1 || !t.dramaVos) continue;
        sections.push({ title: clean(t.tagName).replace(/^./, (c) => c.toUpperCase()) || 'Pilihan', items: uniq(t.dramaVos.map(card)) });
      }
    }
    ranks.forEach((r, i) => {
      if (r.status === 'fulfilled') sections.push({ title: RANKINGS[i][1], items: uniq((r.value.rows || []).map(card)) });
    });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw tabs.reason || ranks[0]?.reason || new UpstreamError('reelbuzz: beranda kosong', 502);
    return { sections: out };
  },

  async search(q) {
    const d = await call(`/search/${encodeURIComponent(q)}`);
    return { items: uniq((d.rows || []).map(card)) };
  },

  async detail(id) {
    const { rows: d } = await call(`/get-detail/${encodeURIComponent(id)}`);
    const episodes = (d.episodeList || []).map((e) => ({
      key: String(e.episodeNo),
      number: e.episodeNo,
      title: `Episode ${e.episodeNo}`,
    }));
    return {
      id: String(id),
      title: clean(d.name),
      cover: d.coverUrl,
      description: clean(d.description),
      tags: tagNames(d.tagList),
      totalEpisodes: Number(d.episodes) || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-all-streams-proxy/${encodeURIComponent(id)}`, { ttl: 60, timeout: 45000 });
    const ep = (d.episodes || []).find((e) => String(e.episodeNo) === String(key));
    const urls = ep?.playUrls || {};
    const url = urls[QUALITY.find((q) => urls[q])];
    if (!url) throw new UpstreamError('reelbuzz: URL stream tidak ditemukan', 502);
    return { url, type: 'mp4', proxy: false };
  },
};
