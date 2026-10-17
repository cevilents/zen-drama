// Adapter KalosTV (narto-drama, prefix /api). Bahasa konten: Indonesia ('id').
// Stream: HLS di CDN dengan CORS terbuka (playlist dan segmen), episode berbayar tetap terbuka lewat /get-stream.
// key episode = episodes_id (bukan nomor urut).

import { upstream, fresh, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'kalostv';
const PREFIX = '/api';
const LANG = 'id';
const TABS = [5, 4077]; // Populer, Rilis Terbaru (id tab di /get-home-tabs)

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: LANG, ...opts.query } });

const card = (v) => ({
  id: String(v.video_id),
  title: String(v.name ?? '').trim(),
  cover: v.img_url,
  episodes: Number(v.video_num) || undefined,
  tags: (v.tags || []).filter(Boolean).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((v) => v.video_id && v.name && v.img_url)
    .map(card)
    .filter((d) => !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'KalosTV',

  async home() {
    const pages = await Promise.allSettled(TABS.map((t) => call('/get-home', { query: { tab_id: t } })));
    const sections = [];
    for (const r of pages) {
      if (r.status !== 'fulfilled') continue;
      for (const s of r.value.sections || []) {
        const items = cards(s.recommend_video);
        if (items.length) sections.push({ title: s.name || 'Pilihan', items });
      }
    }
    if (!sections.length) throw pages.find((r) => r.status === 'rejected')?.reason || new UpstreamError('kalostv: beranda kosong');
    return { sections };
  },

  async search(q) {
    const d = await call('/search', { query: { keyword: q } });
    return { items: cards(d.list) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([
      call(`/get-detail/${encodeURIComponent(id)}`),
      call(`/get-episodes/${encodeURIComponent(id)}`),
    ]);
    const d = info.data;
    const episodes = (eps.episodes || [])
      .slice()
      .sort((a, b) => a.sort_id - b.sort_id)
      .map((e) => ({ key: String(e.episodes_id), number: e.sort_id, title: `Episode ${e.sort_id}` }));
    return {
      id: String(d.video_id),
      title: String(d.name ?? '').trim(),
      cover: d.img_url,
      description: d.description || '',
      tags: (d.tags || []).filter(Boolean),
      totalEpisodes: episodes.length || d.video_num || 0,
      episodes,
    };
  },

  async stream(id, key) {
    // Cache upstream menyimpan URL bertoken yang kedaluwarsa (403 setelah belasan menit), jadi selalu ambil baru.
    const d = await fresh(() => call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 }));
    // Utamakan 720p (H264, CDN Akamai); sisanya resolusi tertinggi yang ada.
    const rs = (d.resolution_info || []).filter((r) => r.url);
    const best = rs.find((r) => r.resolution === 720) || rs.sort((a, b) => b.resolution - a.resolution)[0];
    const url = best?.url || d.url;
    if (!url) throw new UpstreamError('kalostv: URL stream tidak ditemukan');
    return { url, type: 'hls', proxy: false };
  },
};
