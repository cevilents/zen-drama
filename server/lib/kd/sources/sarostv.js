// Adapter SarosTV (narto-drama, prefix /api). Katalog terpisah per bahasa lewat ?lang= (id_ID, en_US; play_id berbeda
// per katalog). Detail/episodes/stream mengikuti katalog id-nya, jadi tetap lang=id_ID (cache bersama).
// Stream: HLS (segmen .ts relatif) di CloudFront tanpa CORS, jadi lewat proxy. Paywall hanya di sisi klien,
// semua episode tetap bisa diputar lewat /get-stream.

import { langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'sarostv';
const PREFIX = '/api';
const LANGS = { id: 'id_ID', en: 'en_US' };
// Channel /get-theater sering tanpa judul; nama cadangan menurut urutan kemunculan.
const FALLBACK_TITLES = ['Pilihan', 'Rekomendasi'];

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });
const fixed = { lang: LANGS.id };

const clean = (s) => String(s ?? '').trim();

const card = (p) => ({
  id: String(p.play_id),
  title: clean(p.name),
  cover: p.cover_url,
  episodes: Number(p.total_episodes) || undefined,
  tags: (p.tags || []).map(clean).filter(Boolean).slice(0, 4),
});

const cards = (list) => {
  const seen = new Set();
  return (list || [])
    .filter((p) => p.play_id && p.name && p.cover_url && !seen.has(p.play_id) && seen.add(p.play_id))
    .map(card);
};

export default {
  id: SOURCE,
  name: 'SarosTV',

  async home() {
    const [theater, foryou] = await Promise.allSettled([call('/get-theater'), call('/get-foryou')]);
    const sections = [];
    if (theater.status === 'fulfilled') {
      let i = 0;
      for (const c of theater.value.channels || []) {
        sections.push({ title: clean(c.title) || FALLBACK_TITLES[i++] || 'Lainnya', items: cards(c.plays) });
      }
    }
    if (foryou.status === 'fulfilled') sections.push({ title: 'Untukmu', items: cards(foryou.value.records) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw theater.reason || foryou.reason || new UpstreamError('sarostv: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    const d = await call('/search', { query: { q } });
    return { items: cards(d.records) };
  },

  async detail(id) {
    const [info, eps] = await Promise.all([
      call(`/get-detail/${encodeURIComponent(id)}`, { query: fixed }),
      call(`/get-episodes/${encodeURIComponent(id)}`, { query: fixed }),
    ]);
    const d = info.data;
    if (!d) throw new UpstreamError('sarostv: drama tidak ditemukan', 404);
    const episodes = (eps.episodes || [])
      .filter((e) => e.num >= 1)
      .map((e) => ({ key: String(e.num), number: e.num, title: `Episode ${e.num}` }));
    return {
      id: String(d.play_id),
      title: clean(d.name),
      cover: d.cover_url,
      description: clean(d.desc),
      tags: (d.tags || []).map(clean).filter(Boolean),
      totalEpisodes: episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await call(`/get-stream/${encodeURIComponent(id)}/${encodeURIComponent(key)}`, { query: fixed, ttl: 60 });
    const url = d.video_url || d.episode?.video_url;
    if (!url) throw new UpstreamError('sarostv: URL stream tidak ditemukan');
    return { url, type: /\.m3u8(\?|$)/i.test(url) ? 'hls' : 'mp4', proxy: true };
  },
};
