// CubeTV (Narto Drama). Bahasa konten lewat ?lang= (id, en); ID video sama di semua bahasa (metadata diterjemahkan).
// Subtitle: ~19 trek .srt per episode, tidak bergantung lang; semua diteruskan (kd.mjs menormalkan & mengurutkan).
// Stream: HLS H.264 (video+audio dalam satu playlist) di Alibaba OSS, CORS terbuka; token ada di query string.
// Episode berbayar (chargeCoin > 0) tetap menghasilkan URL yang bisa diputar.

import { langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'cubetv';
const PREFIX = '/api';
const LANGS = { id: 'id', en: 'en' };

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });

const clean = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}‍️]/gu, '').trim();

// Cover memuat spasi dan huruf Mandarin di path; normalkan ke URL valid.
const url = (u) => {
  try {
    return new URL(u).href;
  } catch {
    return u;
  }
};

const card = (v) => ({
  id: String(v.videoid),
  title: v.videoName,
  cover: url(v.cover),
  episodes: v.totalEpisodeNum || undefined,
  tags: (v.tagInfo || []).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((v) => v.shelfStatus === 1)
    .map(card)
    .filter((d) => d.id && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'CubeTV',

  async home() {
    const d = await call('/get-home');
    const sections = (d.feed?.moduleVideo || [])
      .map((m) => ({ title: clean(m.moduleName) || 'Pilihan', items: cards(m.videoList) }))
      .filter((s) => s.items.length);
    if (!sections.length) throw new UpstreamError('cubetv: beranda kosong');
    return { sections };
  },

  async search(q) {
    const d = await call(`/search/${encodeURIComponent(q)}`);
    return { items: cards(d.list) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), call(`/get-episodes/${encodeURIComponent(id)}`)]);
    const episodes = (eps.items || [])
      .map((e) => ({ key: e.episodeid, number: e.episodeNumber, title: `Episode ${e.episodeNumber}` }))
      .sort((a, b) => a.number - b.number);
    return {
      id: String(info.videoid || id),
      title: info.videoName,
      cover: url(info.cover),
      description: info.summary || '',
      tags: info.tagInfo || [],
      totalEpisodes: info.totalEpisodeNum || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    const link = d.linkInfo?.find((l) => l.codeType === 'H.264' && l.linkUrl)?.linkUrl || d.url;
    if (!link) throw new UpstreamError('cubetv: URL stream tidak ditemukan');
    // 'zh' = Tradisional, 'zh-CN' = Sederhana: keduanya jadi 'zh' di kd.mjs (yang pertama dipakai).
    const subtitles = (d.subtitles || []).filter((x) => x?.url && x.language).map((x) => ({ lang: x.language, url: x.url }));
    return { url: link, type: 'hls', proxy: false, ...(subtitles.length && { subtitles }) };
  },
};
