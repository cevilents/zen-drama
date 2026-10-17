// CandyJar / Galatea TV (Narto Drama). Konten hanya Inggris (/get-languages tidak punya Indonesia).
// Stream: HLS multi-codec (HEVC + H.264 + AV1) di Bunny CDN, CORS terbuka. h264_url dari upstream HANYA video
// (audio terpisah), jadi dipakai master_url; hls.js memilih varian yang bisa didecode browser (H.264 selalu ada).
// Subtitle .srt terpisah (tidak dibakar ke video).

import { upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'candyjar';
const PREFIX = '/api';
const PER_SECTION = 30;

const call = (path, opts = {}) => upstream(SOURCE, path, { prefix: PREFIX, ...opts });

const clean = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}‍️]/gu, '').trim();
const TITLES = { 'new-releases': 'Rilis Baru', trending: 'Trending', 'all-series': 'Semua Serial' };
const ADULT = /adult|mature|nsfw|18/i;

const card = (s) => ({
  id: String(s.id),
  title: clean(s.title),
  cover: s.coverUrl,
  episodes: s.episodesCount || undefined,
  tags: (s.tag_names || []).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((s) => s.isActive !== false && !s.isComingSoon && !ADULT.test(s.accessClassification || ''))
    .map(card)
    .filter((d) => d.id && d.title && d.cover && !seen.has(d.id) && seen.add(d.id))
    .slice(0, PER_SECTION);
};

export default {
  id: SOURCE,
  name: 'CandyJar',

  async home() {
    const d = await call('/get-home');
    const sections = (d.data?.shelves || [])
      .map((s) => ({ title: TITLES[s.slug] || clean(s.title) || 'Pilihan', items: cards(s.data) }))
      .filter((s) => s.items.length);
    if (!sections.length) throw new UpstreamError('candyjar: beranda kosong');
    return { sections };
  },

  async search(q) {
    const d = await call('/search', { query: { q } });
    return { items: cards(d.series) };
  },

  async detail(id) {
    const { data: d } = await call(`/get-detail/${encodeURIComponent(id)}`);
    const s = d.series;
    const episodes = (d.episodes || [])
      .filter((e) => !e.isTrailer)
      .map((e) => ({ key: String(e.number), number: e.number, title: `Episode ${e.number}` }));
    return {
      id: String(id),
      title: clean(s.title),
      cover: s.coverUrl,
      description: clean(s.summary),
      tags: s.tag_names || [],
      totalEpisodes: s.episodesCount || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    const url = d.master_url || d.video_url;
    if (!url) throw new UpstreamError('candyjar: URL stream tidak ditemukan');
    const subtitles = d.subtitles_url ? [{ lang: 'en', label: 'English', url: d.subtitles_url }] : [];
    return { url, type: 'hls', proxy: false, ...(subtitles.length && { subtitles }) };
  },
};
