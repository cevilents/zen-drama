// Adapter My Drama (narto-drama, prefix /api). ?lang= (id, en) menerjemahkan judul/sinopsis untuk id yang sama.
// Katalog tercampur: "Single Pack" (1 episode, Inggris) dan "Main Version" (versi lokal).
// Hanya Main Version yang punya bahasa konten itu (langs) yang ditampilkan, item ageRestricted (18+) dibuang.
// Audio: video_urls_by_lang[bahasa] bila ada (sulih suara), selain itu video_url (audio asli Inggris). Sampel 2026-10-15:
// video_urls_by_lang hanya berisi en/uk/de/es/fr/pt (tanpa 'id'), jadi mode Indonesia memakai video_url.
// ~30 subtitle WebVTT (soft sub), semua diteruskan. Episode 'locked' di upstream
// tetap bisa diputar lewat /get-stream. Stream: HLS CloudFront dengan CORS terbuka (playlist dan segmen).
// key episode = position (nomor episode). Tag upstream berupa UUID tanpa nama, jadi dikosongkan.

import { langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'mydrama';
const PREFIX = '/api';
const LANGS = { id: 'id', en: 'en' };
const PAGE_SIZE = 50; // di atas 50 upstream hang/522

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });

const usable = (s) => s.id && s.name && s.coverUrl && s.seriesType === 'Main Version' && !s.ageRestricted && (s.langs || []).includes(langValue(LANGS));

const card = (s) => ({
  id: String(s.id),
  title: String(s.name).trim(),
  cover: s.coverUrl,
  episodes: Number(s.totalEpisodes) || undefined,
  tags: [],
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter(usable)
    .map(card)
    .filter((d) => !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'My Drama',

  async home() {
    // Upstream lambat (20-60 dtk bila dingin) dan halaman >50 hang, jadi satu halaman 50 saja dengan timeout longgar.
    const d = await call('/get-list', { query: { page_size: PAGE_SIZE }, timeout: 70000 });
    const items = cards([...(d.series || [])].sort((a, b) => (b.view || 0) - (a.view || 0)));
    if (!items.length) throw new UpstreamError('mydrama: beranda kosong');
    return { sections: [{ title: 'Drama Pilihan', items }] };
  },

  async search(q) {
    const d = await call('/search', { query: { keyword: q } });
    return { items: cards(d.series) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([
      call(`/get-detail/${encodeURIComponent(id)}`),
      call(`/get-episodes/${encodeURIComponent(id)}`),
    ]);
    const d = info.data;
    const episodes = (eps.episodes || [])
      .filter((e) => e.position >= 1) // posisi -1/0 = trailer
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ key: String(e.position), number: e.position, title: `Episode ${e.position}` }));
    return {
      id: String(d.id),
      title: String(d.name ?? '').trim(),
      cover: d.coverUrl,
      description: d.description || '',
      tags: [],
      totalEpisodes: episodes.length || d.totalEpisodes || 0,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    const by = d.video_urls_by_lang || {};
    const url = by[langValue(LANGS)] || d.video_url;
    if (!url) throw new UpstreamError('mydrama: URL stream tidak ditemukan');
    const subtitles = Object.entries(d.subs || {})
      .filter(([, u]) => typeof u === 'string' && u)
      .map(([lang, u]) => ({ lang, url: u }));
    return { url, type: 'hls', proxy: false, subtitles };
  },
};
