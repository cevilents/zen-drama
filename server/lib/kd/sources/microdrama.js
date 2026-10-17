// Adapter Micro Drama (narto-drama, prefix /api). Bahasa konten: Indonesia ('id'), katalog terpisah per bahasa.
// Stream: MP4 H264 langsung dari CDN janzhoutec (Access-Control-Allow-Origin hanya untuk satu domain),
// jadi diputar lewat /proxy kita. Semua drama bertanda UNLIMIT, tanpa paywall. key episode = nomor episode.
// Tidak ada tag di data upstream.

import { upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'microdrama';
const PREFIX = '/api';
const LANG = 'id';
// Modul /get-feed yang dipakai (nama kunci 'mrain'); isinya dipetakan ke katalog lewat kode drama.
const FEED = [
  ['list_hot', 'Terpopuler'],
  ['list_good', 'Pilihan Terbaik'],
  ['hot_recommend', 'Rekomendasi'],
];

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: LANG, ...opts.query } });

const card = (d) => ({
  id: String(d.id),
  title: String(d.name ?? '').trim(),
  cover: d.cover_url,
  episodes: Number(d.total_episodes) || undefined,
  tags: (d.tags || []).filter(Boolean).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((d) => d.id && d.name && d.cover_url)
    .map(card)
    .filter((d) => !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'Micro Drama',

  async home() {
    const [catalog, feed] = await Promise.allSettled([call('/get-catalog'), call('/get-feed')]);
    const dramas = catalog.status === 'fulfilled' ? catalog.value.dramas || [] : [];
    const byCode = new Map(dramas.map((d) => [String(d.code), d]));
    const sections = [];
    if (feed.status === 'fulfilled') {
      for (const [key, title] of FEED) {
        const mod = (feed.value.modules || []).find((m) => m.mrain === key);
        const items = cards((mod?.cbuy || []).map((x) => byCode.get(String(x.rinf))));
        if (items.length) sections.push({ title, items });
      }
    }
    const newest = cards([...dramas].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)));
    if (newest.length) {
      sections.push({ title: 'Terbaru', items: newest.slice(0, 30) });
      if (newest.length > 30) sections.push({ title: 'Semua Drama', items: newest.slice(30, 90) });
    }
    if (!sections.length) throw catalog.reason || feed.reason || new UpstreamError('microdrama: beranda kosong');
    return { sections };
  },

  async search(q) {
    const d = await call('/search', { query: { keyword: q } });
    return { items: cards(d.dramas) };
  },

  async detail(id) {
    // Respons detail memuat daftar episode lengkap (beserta URL video, yang diabaikan: stream() meminta ulang).
    const r = await call(`/get-detail/${encodeURIComponent(id)}`);
    const d = r.drama;
    const episodes = (r.episodes || [])
      .slice()
      .sort((a, b) => a.num - b.num)
      .map((e) => ({ key: String(e.num), number: e.num, title: `Episode ${e.num}` }));
    return {
      id: String(d.id),
      title: String(d.name ?? '').trim(),
      cover: d.cover_url,
      description: d.description || '',
      tags: (d.tags || []).filter(Boolean),
      totalEpisodes: d.total_episodes || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    // Utamakan H264 tertinggi (720P); video_url sebagai cadangan.
    const qs = (d.qualities || []).filter((q) => q.url && q.codec === 'h264').sort((a, b) => b.height - a.height);
    const url = qs[0]?.url || d.video_url;
    if (!url) throw new UpstreamError('microdrama: URL stream tidak ditemukan');
    return { url, type: 'mp4', proxy: true };
  },
};
