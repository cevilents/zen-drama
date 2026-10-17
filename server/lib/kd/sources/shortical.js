// Adapter Shortical (narto-drama, prefix /api). Katalog & id sama untuk semua bahasa; ?lang (id, en) menerjemahkan
// kategori, subtitle, dan judul/deskripsi bila serinya punya terjemahan (sebagian tetap Inggris). Audio Inggris.
// Stream: HLS di CloudFront dengan CORS terbuka. Subtitle bahasa permintaan disediakan sebagai file VTT terpisah.
// Katalog bersifat episodik: hanya episode yang sudah rilis punya URL (comingSoon=true tidak ditampilkan).
// /search/<q> mengabaikan kata kunci (selalu 100 judul teratas), jadi hasilnya disaring di sisi kita.

import { contentLang, langValue, upstream, UpstreamError } from '../lib/upstream.js';

const SOURCE = 'shortical';
const PREFIX = '/api';
const LANGS = { id: 'id', en: 'en' };

const call = (path, opts = {}) =>
  upstream(SOURCE, path, { prefix: PREFIX, ...opts, query: { lang: langValue(LANGS), ...opts.query } });

const clean = (s) => String(s ?? '').trim();

// Judul yang belum rilis atau butuh persetujuan konten dewasa dibuang.
const visible = (s) =>
  s?.id && s.name && !s.consentRequired && !(s.comingSoonData?.releaseDate && Date.parse(s.comingSoonData.releaseDate) > Date.now());

// Item upstream: { series | recommendation, thumbnail }
const cards = (list) => {
  const seen = new Set();
  const out = [];
  for (const x of list || []) {
    const s = x.series || x.recommendation;
    if (!visible(s) || !x.thumbnail || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({
      id: String(s.id),
      title: clean(s.name),
      cover: x.thumbnail,
      tags: (s.categories || []).map(clean).filter(Boolean).slice(0, 4),
      _desc: clean(s.description),
    });
  }
  return out;
};

const strip = (items) => items.map(({ _desc, ...d }) => d);

const allStreams = (id, opts) => call(`/get-all-streams/${encodeURIComponent(id)}`, opts);

export default {
  id: SOURCE,
  name: 'Shortical',

  async home() {
    const [home, more] = await Promise.allSettled([call('/get-home'), call('/get-browse/more-recommended')]);
    const sections = [];
    if (home.status === 'fulfilled') {
      const h = home.value;
      sections.push({ title: 'Pilihan Untukmu', items: strip(cards(h.foryou)) });
      sections.push({ title: 'Sedang Tren', items: strip(cards(h.trending)) });
      sections.push({ title: 'Sorotan', items: strip(cards(h.hero)) });
    }
    if (more.status === 'fulfilled') sections.push({ title: 'Rekomendasi', items: strip(cards(more.value.items)) });
    const out = sections.filter((s) => s.items.length);
    if (!out.length) throw home.reason || more.reason || new UpstreamError('shortical: beranda kosong');
    return { sections: out };
  },

  async search(q) {
    const d = await call(`/search/${encodeURIComponent(q)}`);
    const terms = clean(q).toLowerCase().split(/\s+/).filter(Boolean);
    const items = cards(d.items).filter((c) => {
      const hay = `${c.title} ${c.tags.join(' ')} ${c._desc}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    return { items: strip(items) };
  },

  async detail(id) {
    const [info, all] = await Promise.all([call(`/get-detail/${encodeURIComponent(id)}`), allStreams(id)]);
    const s = info.series;
    if (!s) throw new UpstreamError('shortical: drama tidak ditemukan', 404);
    const episodes = (all.episodes || [])
      .filter((e) => !e.comingSoon && (e.urlDefault || e.url) && e.number >= 1)
      .sort((a, b) => a.number - b.number)
      .map((e) => ({ key: String(e.number), number: e.number, title: `Episode ${e.number}` }));
    return {
      id: String(s.id),
      title: clean(s.name),
      cover: info.thumbnail,
      description: clean(s.description),
      tags: (s.categories || []).map(clean).filter(Boolean),
      totalEpisodes: episodes.length,
      episodes,
    };
  },

  async stream(id, key) {
    const d = await allStreams(id, { ttl: 60 });
    const e = (d.episodes || []).find((x) => String(x.number) === String(key) && !x.comingSoon);
    // urlDefault = HLS biasa (video+audio); `url` membawa grup audio/subtitle terpisah.
    const url = e?.urlDefault || e?.url;
    if (!url) throw new UpstreamError('shortical: episode belum rilis atau stream tidak tersedia', 404);
    // Playlist subtitle hanya berisi satu segmen VTT: <nama>_00001.vtt.
    const sub = e.subtitle?.url?.replace(/\.m3u8$/, '_00001.vtt');
    const subtitles = sub ? [{ lang: e.subtitle.language || contentLang(), label: e.subtitle.name, url: sub }] : [];
    return { url, type: 'hls', proxy: false, ...(subtitles.length && { subtitles }) };
  },
};
