// BibiShort (Narto Drama). Bahasa konten lewat ?lang= (id-ID, en-US); dramaId sama di semua bahasa (judul, sinopsis dan
// video sulih suara/hardsub ikut lang), jadi lang dikirim ke semua endpoint. Tidak ada trek subtitle.
// Stream: HLS di edge bibishort-e2.narto-drama.com dengan CORS terbuka (playlist dan segmen).
// Episode berbayar terbuka lewat /get-stream per episode; /get-all-streams sengaja tidak dipakai (unlock massal, berat).

import { langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'bibishort';
const PREFIX = '/api';
const LANGS = { id: 'id-ID', en: 'en-US' };

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });

const clean = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}‍️]/gu, '').trim();

const card = (x) => ({
  id: String(x.dramaId),
  title: clean(x.title),
  cover: x.cover,
  episodes: x.episodeTotal || undefined,
  tags: [],
});

const cards = (list) => {
  const seen = new Set();
  return (list || []).map(card).filter((d) => d.id && d.title && d.cover && !seen.has(d.id) && seen.add(d.id));
};

export default {
  id: SOURCE,
  name: 'BibiShort',

  async home() {
    const d = await call('/get-home');
    const sections = (d.modules || [])
      .map((m) => ({ title: m.type === 'banner' ? 'Sorotan' : clean(m.title) || 'Pilihan', items: cards(m.dramas) }))
      .filter((s) => s.items.length);
    if (!sections.length) throw new UpstreamError('bibishort: beranda kosong');
    return { sections };
  },

  async search(q) {
    const d = await call(`/search/${encodeURIComponent(q)}`);
    return { items: cards(d.items) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), call(`/get-episodes/${encodeURIComponent(id)}`)]);
    const episodes = (eps.episodes || [])
      .filter((e) => !e.comingSoon)
      .map((e) => ({ key: String(e.seq), number: e.seq, title: `Episode ${e.seq}` }));
    return {
      id: String(id),
      title: clean(info.title),
      cover: info.cover,
      description: clean(info.description),
      tags: [info.category, info.subCategory].map(clean).filter(Boolean),
      totalEpisodes: info.episodeTotal || episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { ttl: 60 });
    if (!d.url) throw new UpstreamError('bibishort: URL stream tidak ditemukan');
    return { url: d.url, type: 'hls', proxy: false };
  },
};
